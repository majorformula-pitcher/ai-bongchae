import re

with open("src/index.css", "r", encoding="utf-8") as f:
    lines = f.readlines()

clean_lines = []
for line in lines:
    # 닫히지 않은 문자열 에러를 유발하는 구역 수정
    if "content:" in line and ("•" in line or "??" in line):
        line = re.sub(r'content: "[^"]*"', 'content: "\\2022"', line)
    
    # 구 슬라이드 디자인 섹션이 시작되면 중단
    if "/* [Email Capture Template]" in line:
        break
    clean_lines.append(line)

new_styles = """
/* [FONTS] Samsung Professional Fonts */
@font-face {
  font-family: 'SamsungOneKorean';
  src: url('/fonts/SamsungOneKorean-700.otf') format('opentype');
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: 'SamsungOneKorean';
  src: url('/fonts/SamsungOneKorean-500.otf') format('opentype');
  font-weight: 500;
  font-style: normal;
}
@font-face {
  font-family: 'SamsungSharpSans';
  src: url('/fonts/SAMSUNGSHARPSANS-BOLD.TTF') format('truetype');
  font-weight: 700;
  font-style: normal;
}

/* [SLIDE STYLE] Professional PPT Format */
.slide-capture-area {
  width: 750px;
  background-color: #ffffff;
  padding: 45px 55px;
  box-sizing: border-box;
  position: relative;
  border: 1px solid #e0e0e0;
  margin: 0 auto;
  font-family: 'SamsungOneKorean', sans-serif;
  min-height: 420px;
  display: block !important;
}

.sra-tag {
  position: absolute;
  top: 45px;
  right: 55px;
  border: 2px solid #0055ff;
  color: #0055ff;
  padding: 3px 14px;
  font-weight: bold;
  font-size: 18px;
  font-family: 'SamsungSharpSans', sans-serif;
  letter-spacing: 1px;
}

.slide-capture-title {
  color: #0033aa !important;
  font-family: 'SamsungOneKorean', sans-serif !important;
  font-size: 34px !important;
  font-weight: 700 !important;
  margin-top: 0 !important;
  margin-bottom: 35px !important;
  text-decoration: underline !important;
  text-underline-offset: 10px !important;
  line-height: 1.3 !important;
  width: 82% !important; 
  word-break: keep-all !important;
  text-align: left !important;
}

.slide-content-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 35px;
  margin-bottom: 45px;
}

.slide-capture-bullets {
  flex: 1.8;
  padding-left: 25px;
  margin: 0;
  list-style-type: disc;
}

.slide-capture-bullet-item {
  color: #000000 !important;
  font-family: 'SamsungOneKorean', sans-serif !important;
  font-size: 22px !important;
  font-weight: 500 !important;
  line-height: 1.6 !important;
  margin-bottom: 22px !important;
  word-break: keep-all !important;
  text-align: left !important;
}

.slide-capture-image {
  width: 280px !important;
  height: 220px !important;
  object-fit: cover !important;
  border-radius: 25px !important;
  box-shadow: 0 5px 20px rgba(0,0,0,0.12) !important;
  flex: 1;
}

.slide-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #e0e0e0;
  padding-top: 18px;
  margin-top: 25px;
}

.slide-footer-url {
  color: #888888;
  font-size: 13px;
  font-family: Arial, sans-serif;
  max-width: 75%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slide-footer-date {
  color: #888888;
  font-size: 13px;
}
"""

with open("src/index.css", "w", encoding="utf-8") as f:
    f.writelines(clean_lines)
    f.write(new_styles)
