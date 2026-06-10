# Level 3: 핵심 모듈 상세 흐름도 (Module Details)

이 문서는 시스템 내에서 가장 복잡한 비즈니스 로직을 담당하는 **PPT 리포트 자동 생성 모듈**의 내부 동작 방식을 설명합니다.

## 3.1 PPT 자동 생성 모듈 로직 (Python Extractor)

좋아요를 누른 뉴스 데이터를 바탕으로 Python 윈도우 COM 객체를 이용해 PowerPoint 슬라이드를 자동으로 생성해주는 프로세스입니다.

```mermaid
flowchart TD
    A3[백엔드 서버] -->|Python 스크립트 호출<br/>'python core.py'| B3[core.py 메인 프로세스]
    
    B3 -->|1. 선택된 뉴스 데이터 조회| C3[(데이터베이스)]
    
    C3 -->|뉴스 리스트 반환| D3[HTML 렌더링 템플릿]
    D3 -->|뉴스 텍스트와 이미지 병합| E3[임시 HTML 파일 생성]
    
    E3 -->|2. 브라우저 엔진 기반 캡처| F3[Pyppeteer 모듈]
    F3 -->|화면 렌더링 후 스크린샷| G3[뉴스 캡처 이미지 생성]
    
    G3 -->|3. win32com.client 호출| H3[PowerPoint 프로세스 제어]
    H3 -->|원본 템플릿 파일 열기| I3[보고서 템플릿 PPTX]
    
    I3 -->|슬라이드 복제 및 추가| J3[슬라이드 수정 작업]
    J3 -->|캡처 이미지 삽입 및 날짜 텍스트 갱신| J3
    
    J3 -->|최종 파일 저장 및 종료| K3[최종 ai-bongchae_report.pptx]
    
    K3 -->|다운로드 경로 반환| A3
```
