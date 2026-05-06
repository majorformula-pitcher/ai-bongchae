import os
import threading
import customtkinter as ctk
from tkinter import filedialog, messagebox
from core import extract_ppt_content, generate_html_report

# 테마 설정 (어두운 테마, 파란색 테마)
ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")

class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("AI 봉채 메일 헬퍼 (PPT 캡처기)")
        self.geometry("600x400")
        self.resizable(False, False)

        # 타이틀 라벨
        self.lbl_title = ctk.CTkLabel(self, text="DRM PPT 캡처 및 HTML 생성기", font=ctk.CTkFont(size=20, weight="bold"))
        self.lbl_title.pack(pady=(20, 20))

        # 파일 선택 프레임
        self.frame_file = ctk.CTkFrame(self)
        self.frame_file.pack(pady=10, padx=20, fill="x")

        self.entry_file = ctk.CTkEntry(self.frame_file, placeholder_text="변환할 PPTX 파일을 선택하세요...", width=400)
        self.entry_file.pack(side="left", padx=(10, 10), pady=10)

        self.btn_browse = ctk.CTkButton(self.frame_file, text="파일 찾기", command=self.browse_file, width=100)
        self.btn_browse.pack(side="left", padx=(0, 10), pady=10)

        # 실행 버튼
        self.btn_start = ctk.CTkButton(self, text="▶ 캡처 및 변환 시작", command=self.start_conversion, font=ctk.CTkFont(size=15, weight="bold"), height=40)
        self.btn_start.pack(pady=20)

        # 로그 텍스트 박스
        self.textbox_log = ctk.CTkTextbox(self, width=560, height=150, state="disabled")
        self.textbox_log.pack(pady=(0, 20), padx=20)

    def log(self, message):
        """텍스트 박스에 로그를 추가합니다."""
        self.textbox_log.configure(state="normal")
        self.textbox_log.insert("end", message + "\n")
        self.textbox_log.see("end")
        self.textbox_log.configure(state="disabled")
        self.update_idletasks()

    def browse_file(self):
        """파일 탐색기를 열어 PPTX 파일을 선택합니다."""
        file_path = filedialog.askopenfilename(
            title="PPTX 파일 선택",
            filetypes=[("PowerPoint Files", "*.pptx"), ("All Files", "*.*")]
        )
        if file_path:
            self.entry_file.delete(0, "end")
            self.entry_file.insert(0, file_path)

    def start_conversion(self):
        """변환 프로세스를 시작합니다 (GUI 멈춤 방지를 위해 스레드 사용)."""
        pptx_path = self.entry_file.get().strip()
        
        if not pptx_path or not os.path.exists(pptx_path):
            messagebox.showerror("오류", "유효한 PPTX 파일 경로를 선택해 주세요.")
            return
            
        if not pptx_path.lower().endswith(".pptx"):
            messagebox.showerror("오류", ".pptx 확장자 파일만 지원합니다.")
            return

        # 버튼 비활성화 (중복 실행 방지)
        self.btn_start.configure(state="disabled")
        self.btn_browse.configure(state="disabled")
        self.textbox_log.configure(state="normal")
        self.textbox_log.delete("1.0", "end")
        self.textbox_log.configure(state="disabled")
        
        self.log("작업을 준비 중입니다...")

        # 스레드 생성 및 시작
        threading.Thread(target=self.run_extraction, args=(pptx_path,), daemon=True).start()

    def run_extraction(self, pptx_path):
        """백그라운드 스레드에서 실행되는 실제 추출 로직"""
        out_dir = os.path.join(os.path.dirname(os.path.abspath(pptx_path)), "output")
        
        try:
            self.log(f"선택된 파일: {os.path.basename(pptx_path)}")
            self.log("파워포인트를 백그라운드에서 구동하여 캡처를 시작합니다. 잠시만 기다려주세요...")
            
            # core.py 의 캡처 함수 호출
            results = extract_ppt_content(pptx_path, out_dir)
            
            self.log(f"총 {len(results)}장의 슬라이드 캡처가 완료되었습니다.")
            self.log("HTML 메일 서식을 생성합니다...")
            
            # HTML 리포트 생성 및 표시
            report_path = os.path.join(out_dir, "report.html")
            generate_html_report(results, report_path)
            
            self.log("모든 작업이 성공적으로 완료되었습니다!")
            self.log("웹 브라우저가 열리면 화면을 복사(Ctrl+A, Ctrl+C)하여 메일에 붙여넣기 하세요.")
            
            messagebox.showinfo("완료", "변환이 완료되었습니다! 브라우저 창을 확인하세요.")
            
        except Exception as e:
            self.log(f"[오류 발생] {str(e)}")
            messagebox.showerror("오류", f"작업 중 오류가 발생했습니다:\n{str(e)}")
        finally:
            # 버튼 다시 활성화
            self.btn_start.configure(state="normal")
            self.btn_browse.configure(state="normal")

if __name__ == "__main__":
    app = App()
    app.mainloop()
