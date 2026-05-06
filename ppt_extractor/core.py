import os
import re
import win32com.client
import webbrowser
from pathlib import Path

def trim_white_margins(image_path):
    """Pillow를 사용하여 이미지의 불필요한 단색(흰색) 여백을 자동으로 잘라냅니다."""
    try:
        from PIL import Image, ImageChops
        img = Image.open(image_path)
        # 좌상단 픽셀(0,0)의 색상을 배경색으로 가정
        bg = Image.new(img.mode, img.size, img.getpixel((0,0)))
        diff = ImageChops.difference(img, bg)
        bbox = diff.getbbox()
        if bbox:
            cropped_img = img.crop(bbox)
            cropped_img.save(image_path, quality=100)
    except ImportError:
        pass # Pillow가 설치되지 않은 경우 무시
    except Exception as e:
        print(f"Error cropping image {image_path}: {e}")

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
        
    powerpoint = None
    presentation = None
    results = []

    try:
        # 백그라운드 파워포인트 앱 구동
        powerpoint = win32com.client.Dispatch("PowerPoint.Application")
        # 화면에 보이지 않도록 설정 (단, 일부 버전이나 환경에 따라 무시될 수 있음)
        # powerpoint.Visible = False # DRM 에이전트에 따라 Visible=False 시 에러가 날 수 있으므로 주석 처리
        
        print(f"Opening presentation: {pptx_path}")
        # PPT 열기 (WithWindow=msoFalse 를 쓰면 화면에 안 뜸)
        presentation = powerpoint.Presentations.Open(pptx_path, ReadOnly=True, WithWindow=False)
        
        # 원본 슬라이드 가로세로 비율 유지하며 고화질(가로 1920 기준) 캡처를 위한 크기 계산
        slide_width_pt = presentation.PageSetup.SlideWidth
        slide_height_pt = presentation.PageSetup.SlideHeight
        scale_factor = 1920 / slide_width_pt
        target_width = int(slide_width_pt * scale_factor)
        target_height = int(slide_height_pt * scale_factor)
        
        # 정규표현식: http 또는 https 로 시작하는 URL 찾기
        url_pattern = re.compile(r'https?://[^\s]+')
        
        for index, slide in enumerate(presentation.Slides, start=1):
            # 1. 이미지 캡처
            img_filename = f"slide_{index:03d}.jpg"
            img_path = os.path.join(output_dir, img_filename)
            
            print(f"Exporting slide {index} to {img_path}")
            # 슬라이드를 JPG로 Export (원본 비율 유지하면서 가로 1920 픽셀로 강제 지정)
            slide.Export(img_path, "JPG", target_width, target_height)
            
            # 캡처 직후 위아래 하얀 여백 자동 제거
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
        print(f"Error during PPT extraction: {e}")
        raise e
        
    finally:
        # 안전한 종료 처리
        if presentation:
            presentation.Close()
        if powerpoint:
            # Quit()을 호출하면 캡처용으로 열었던 파워포인트 프로세스가 완전히 종료됨
            powerpoint.Quit()
            
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
        # 로컬 파일 경로를 URL 형식(file:///)으로 변환
        img_uri = Path(img_path).as_uri()
        
        html_content.append("<div style='margin-bottom: 15px;'>")
        
        # URL이 존재하면 첫 번째 URL로 이미지 자체에 링크를 검
        if res['urls']:
            target_url = res['urls'][0]
            html_content.append(f"<a href='{target_url}' target='_blank' title='클릭하여 뉴스 보기'>")
            html_content.append(f"<img src='{img_uri}' style='max-width: 800px; width: 100%; border: 1px solid #ddd; border-radius: 4px;' />")
            html_content.append("</a><br>")
        else:
            # URL이 없는 슬라이드는 이미지만 표시
            html_content.append(f"<img src='{img_uri}' style='max-width: 800px; width: 100%; border: 1px solid #ddd; border-radius: 4px;' /><br>")
            
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
