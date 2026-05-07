import os
import re
import time
import base64
import win32com.client
import webbrowser
import logging
from pathlib import Path
from PIL import Image, ImageGrab, ImageChops, ImageDraw, ImageOps

def trim_white_margins(image_path):
    """Pillow를 사용하여 이미지의 불필요한 단색(흰색) 여백을 자동으로 잘라냅니다."""
    try:
        # 파일이 비어있는지 1차 확인 (DRM 캡처 실패 방어)
        if not os.path.exists(image_path) or os.path.getsize(image_path) < 1024:
            logging.warning(f"이미지가 너무 작거나 없습니다(손상 의심). 자르기를 건너뜁니다: {image_path}")
            return
            
        img = Image.open(image_path)
        
        # 타겟 배경색을 강제로 순백색(255, 255, 255)으로 고정하여 모서리 오염 무시
        bg = Image.new('RGB', img.size, (255, 255, 255))
        diff = ImageChops.difference(img.convert('RGB'), bg)
        
        # 미세한 안티앨리어싱 및 그림자 찌꺼기를 무시하기 위한 오차 허용(Tolerance) 적용
        diff_bw = diff.convert('L')
        threshold = 8  # 민감도를 8로 낮춤 (회색 박스는 보존하고 순백색 여백만 제거)
        diff_bw = diff_bw.point(lambda p: 255 if p > threshold else 0)
        
        # --- 가장자리 노이즈 차단 (가장자리 15픽셀 검은색으로 칠해서 무시) ---
        draw = ImageDraw.Draw(diff_bw)
        w, h = diff_bw.size
        border = 15
        draw.rectangle([0, 0, w, border], fill=0)          # 상단 테두리 무시
        draw.rectangle([0, h-border, w, h], fill=0)        # 하단 테두리 무시
        draw.rectangle([0, 0, border, h], fill=0)          # 좌측 테두리 무시
        draw.rectangle([w-border, 0, w, h], fill=0)        # 우측 테두리 무시
        # ------------------------------------------------------------------
        
        bbox = diff_bw.getbbox()
        if bbox:
            cropped_img = img.crop(bbox)
            # 강제 여백 기능을 제거하여 회색 박스 경계에 딱 맞게 초밀착 크롭
            # cropped_img = ImageOps.expand(cropped_img, border=5, fill='white')
            
            # 해상도 상향: 가로 최대 1200px로 리사이징
            cropped_img.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
            
            # 품질 상향: Quality 85로 설정하여 11장 기준 약 4MB 수준으로 최적화
            cropped_img.save(image_path, "JPEG", quality=85, optimize=True)
            logging.info(f"Auto-crop 성공 (초밀착 모드): {image_path}")
    except ImportError:
        logging.warning("Pillow가 설치되지 않아 Auto-crop을 건너뜁니다.")
    except Exception as e:
        logging.error(f"Error cropping image {image_path}: {e}")

def extract_ppt_content(pptx_path, output_dir):
    """
    주어진 PPT 파일을 백그라운드로 열어 각 슬라이드를 이미지로 저장하고,
    슬라이드 노트에서 URL을 추출하여 매핑 정보를 반환합니다.
    """
    pptx_path = os.path.abspath(pptx_path)
    output_dir = os.path.abspath(output_dir)
    
    # 출력 폴더 생성
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    # 로깅 설정
    log_file = os.path.join(output_dir, "error_log.txt")
    logging.basicConfig(filename=log_file, level=logging.DEBUG, 
                        format='%(asctime)s - %(levelname)s - %(message)s')
    logging.info("--- PPT Extraction Started ---")
        
    powerpoint = None
    presentation = None
    results = []

    try:
        logging.info("Starting PowerPoint Application...")
        # 백그라운드 파워포인트 앱 구동
        powerpoint = win32com.client.Dispatch("PowerPoint.Application")
        # DRM 화면 렌더링을 위해 창을 강제로 띄움 (1 = True)
        try:
            powerpoint.Visible = 1
            logging.info("PowerPoint Visible set to True")
        except Exception as e:
            logging.warning(f"Could not set Visible=True: {e}")
        
        logging.info(f"Opening presentation: {pptx_path}")
        # PPT 열기 (DRM 렌더링을 위해 WithWindow=True 사용)
        presentation = powerpoint.Presentations.Open(pptx_path, ReadOnly=True, WithWindow=True)
        
        # 원본 슬라이드 가로세로 비율 유지하며 고화질(가로 1920 기준) 캡처를 위한 크기 계산
        slide_width_pt = presentation.PageSetup.SlideWidth
        slide_height_pt = presentation.PageSetup.SlideHeight
        scale_factor = 1920 / slide_width_pt
        target_width = int(slide_width_pt * scale_factor)
        target_height = int(slide_height_pt * scale_factor)
        
        # 정규표현식: http 또는 https 로 시작하는 URL 찾기
        url_pattern = re.compile(r'https?://[^\s]+')
        
        # 슬라이드 쇼 설정 및 실행
        logging.info("Starting Slide Show for full-screen high-res capture...")
        slide_show_settings = presentation.SlideShowSettings
        slide_show_settings.ShowType = 1 # ppShowTypeSpeaker (전체화면)
        slide_show_settings.Run()
        
        # 슬라이드쇼가 화면에 완전히 렌더링되고 하단 컨트롤러 바가 완전히 사라질 때까지 충분히 대기
        time.sleep(7.0)
        
        slide_window = presentation.SlideShowWindow
        
        for index, slide in enumerate(presentation.Slides, start=1):
            # 1. 이미지 캡처
            img_filename = f"slide_{index:03d}.jpg"
            img_path = os.path.join(output_dir, img_filename)
            
            logging.info(f"Taking screenshot of slide {index} (Full Screen DRM Bypass)")
            
            try:
                # 1. 무조건 모니터 전체 화면 캡처
                img = ImageGrab.grab()
                
                # 2. 수학적 중앙 자르기(Center Crop)를 통한 작업표시줄 제거
                screen_w, screen_h = img.size
                slide_ratio = slide_width_pt / slide_height_pt
                screen_ratio = screen_w / screen_h
                
                if screen_ratio > slide_ratio:
                    # 화면이 슬라이드보다 좌우로 더 긴 경우 (좌우 레터박스)
                    crop_h = screen_h
                    crop_w = crop_h * slide_ratio
                else:
                    # 화면이 슬라이드보다 위아래로 더 긴 경우 (상하 레터박스/작업표시줄 포함)
                    crop_w = screen_w
                    crop_h = crop_w / slide_ratio
                    
                # 화면 정중앙 좌표 계산
                left = (screen_w - crop_w) / 2
                top = (screen_h - crop_h) / 2
                right = left + crop_w
                bottom = top + crop_h
                
                logging.info(f"Center Cropping: from {screen_w}x{screen_h} to {int(crop_w)}x{int(crop_h)}")
                # 작업표시줄 및 빈 공간 싹둑 잘라내기
                img = img.crop((int(left), int(top), int(right), int(bottom)))
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                    
                # 해상도 상향: 가로 최대 1200px로 리사이징
                img.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
                
                # 품질 상향: Quality 85로 설정하여 11장 기준 약 4MB 수준으로 최적화
                img.save(img_path, "JPEG", quality=85, optimize=True)
                img_size = os.path.getsize(img_path)
                logging.info(f"Slide {index} exported successfully from screenshot. Size: {img_size} bytes")
            except Exception as e:
                logging.error(f"Slide {index} screenshot failed: {e}")
                
            # 다음 슬라이드로 넘어가기
            if index < len(presentation.Slides):
                slide_window.View.Next()
                # 화면 전환 및 렌더링 대기
                time.sleep(1.5)
            
            # 캡처 직후 위아래 하얀 여백 자동 제거 (정밀 임계값 8 적용)
            trim_white_margins(img_path)
            
            # 2. 노트에서 URL 추출
            extracted_urls = []
            if slide.HasNotesPage:
                notes_page = slide.NotesPage
                # 노트 텍스트는 보통 두 번째 PlaceHolder에 위치함
                for shape in notes_page.Shapes:
                    if shape.HasTextFrame:
                        if shape.TextFrame.HasText:
                            text = shape.TextFrame.TextRange.Text
                            urls = url_pattern.findall(text)
                            if urls:
                                extracted_urls.extend(urls)
                                
            # 결과 딕셔너리 저장
            results.append({
                'slide_number': index,
                'image_path': img_path,
                'urls': extracted_urls
            })
            
    except Exception as e:
        logging.error(f"Error during PPT extraction: {e}")
        raise e
        
    finally:
        logging.info("--- PPT Extraction Finished ---")
        # 안전한 종료 처리
        try:
            if presentation and getattr(presentation, 'SlideShowWindow', None):
                presentation.SlideShowWindow.View.Exit()
        except Exception:
            pass
            
        if presentation:
            try:
                presentation.Close()
            except Exception as e:
                logging.warning(f"Ignored error during presentation.Close(): {e}")
                
        if powerpoint:
            # Quit()을 호출하면 캡처용으로 열었던 파워포인트 프로세스가 완전히 종료됨
            try:
                powerpoint.Quit()
            except Exception as e:
                logging.warning(f"Ignored error during powerpoint.Quit(): {e}")
            
    return results

def generate_html_report(results, output_html_path):
    """
    캡처된 이미지 경로와 URL 정보를 바탕으로 이메일 복사용 HTML 파일을 생성하고 브라우저로 띄웁니다.
    """
    html_content = [
        "<html>",
        "<head><meta charset='utf-8'></head>",
        "<body style='font-family: sans-serif;'>"
    ]
    
    for res in results:
        img_path = res['image_path']
        
        # 로컬 파일 대신 Base64 인코딩으로 변환하여 HTML 내부에 이미지 자체를 박아넣음
        # 이메일에 복사/붙여넣기 시 이미지가 정상적으로 첨부되도록 하기 위함
        try:
            with open(img_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            img_uri = f"data:image/jpeg;base64,{encoded_string}"
        except Exception as e:
            print(f"Error encoding image {img_path}: {e}")
            # 인코딩 실패 시 기존 로컬 경로 방식으로 fallback (작동 안할 수 있음)
            img_uri = Path(img_path).as_uri()
        
        html_content.append("<div style='margin-bottom: 30px;'>")
        
        # URL이 존재하면 첫 번째 URL로 이미지 자체에 링크를 검
        if res['urls']:
            target_url = res['urls'][0]
            html_content.append(f"<a href='{target_url}' target='_blank' title='클릭하여 뉴스 보기'>")
            html_content.append(f"<img src='{img_uri}' style='max-width: 800px; width: 100%;' />")
            html_content.append("</a><br>")
        else:
            # URL이 없는 슬라이드는 이미지만 표시
            html_content.append(f"<img src='{img_uri}' style='max-width: 800px; width: 100%;' /><br>")
            
        html_content.append("</div>")
        
    html_content.append("</body></html>")
    
    # HTML 파일 저장
    with open(output_html_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(html_content))
        
    print(f"HTML report generated at: {output_html_path}")
    
    # 기본 브라우저로 열기
    webbrowser.open(Path(output_html_path).as_uri())

if __name__ == "__main__":
    # 로컬 테스트용 코드
    sample_ppt = r"sample.pptx" # 테스트할 파일 이름
    out_dir = r"output"
    
    if os.path.exists(sample_ppt):
        print(f"Testing extraction on {sample_ppt}...")
        results = extract_ppt_content(sample_ppt, out_dir)
        for res in results:
            print(f"Slide {res['slide_number']}: URLs -> {res['urls']}")
            
        # HTML 리포트 생성 및 표시
        report_path = os.path.join(out_dir, "report.html")
        generate_html_report(results, report_path)
        
        print("Extraction and report generation completed successfully.")
    else:
        print(f"Sample file {sample_ppt} not found. Please provide a valid PPTX file for testing.")
