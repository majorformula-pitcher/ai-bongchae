import re

with open("src/index.css", "r", encoding="utf-8") as f:
    lines = f.readlines()

clean_lines = []
for line in lines:
    if "content:" in line and ("•" in line or "??" in line):
        line = re.sub(r'content: "[^"]*"', 'content: "\\2022"', line)
    if "/* [Email Capture Template]" in line:
        break
    clean_lines.append(line)

new_styles = r"""
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

/* [SLIDE STYLE] Professional PPT Format (Fixed Layout) */
.slide-capture-area {
  width: 900px !important;
  background-color: #f2f2f2 !important;
  padding: 50px 60px !important;
  box-sizing: border-box !important;
  position: relative !important;
  border: 1px solid #d1d1d1 !important;
  margin: 0 auto !important;
  font-family: 'SamsungOneKorean', 'Malgun Gothic', sans-serif !important;
  min-height: 480px !important;
  display: block !important;
}

.sra-tag {
  position: absolute !important;
  top: 50px !important;
  right: 60px !important;
  border: 2px solid #0055ff !important;
  background-color: #f2f2f2 !important;
  color: #0055ff !important;
  padding: 4px 18px !important;
  font-weight: bold !important;
  font-size: 20px !important;
  font-family: 'SamsungSharpSans', sans-serif !important;
  letter-spacing: 1px !important;
  z-index: 100 !important;
}

.slide-capture-title {
  color: #0033aa !important;
  font-family: 'SamsungOneKorean', sans-serif !important;
  font-size: 42px !important;
  font-weight: 700 !important;
  margin-top: 0 !important;
  margin-bottom: 45px !important;
  text-decoration: underline !important;
  text-underline-offset: 12px !important;
  line-height: 1.2 !important;
  width: 80% !important; 
  word-break: keep-all !important;
  text-align: left !important;
}

.slide-content-container {
  display: flex !important;
  flex-direction: row !important;
  justify-content: space-between !important;
  align-items: flex-start !important;
  gap: 40px !important;
  margin-bottom: 40px !important;
  width: 100% !important;
}

.slide-capture-bullets {
  flex: 1 !important;
  padding-left: 30px !important;
  margin: 0 !important;
  list-style-type: disc !important;
}

.slide-capture-bullet-item {
  color: #000000 !important;
  font-family: 'SamsungOneKorean', sans-serif !important;
  font-size: 26px !important;
  font-weight: 600 !important;
  line-height: 1.5 !important;
  margin-bottom: 25px !important;
  word-break: keep-all !important;
  text-align: left !important;
}

.slide-capture-image {
  width: 320px !important;
  height: 240px !important;
  object-fit: cover !important;
  border-radius: 35px !important;
  box-shadow: 0 8px 25px rgba(0,0,0,0.15) !important;
  flex-shrink: 0 !important;
}

.slide-footer {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  border-top: 1px solid #cccccc !important;
  padding-top: 20px !important;
  margin-top: 30px !important;
}

.slide-footer-url {
  color: #777777 !important;
  font-size: 14px !important;
  font-family: Arial, sans-serif !important;
  max-width: 70% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.slide-footer-date {
  color: #777777 !important;
  font-size: 14px !important;
}
"""

with open("src/index.css", "w", encoding="utf-8") as f:
    f.writelines(clean_lines)
    f.write(new_styles)
