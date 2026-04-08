import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Gemini AI 초기화 (목록에서 확인된 gemini-2.5-flash 모델 사용)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(express.json());

// 1. 빌드된 정적 파일 서빙 (React)
app.use(express.static(path.join(__dirname, '../dist')));

// 2. 뉴스 추출 및 요약 API
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  try {
    // 뉴스 본문 크롤링
    const { data: html } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(html);
    
    // 주요 텍스트 추출 (제목 및 본문 영역 추출 시도)
    const bodyText = $('article, main, .article_body, #articleBodyContents, .news_end').text().slice(0, 10000);

    if (!bodyText || bodyText.length < 100) {
      throw new Error('뉴스 본문을 충분히 추출할 수 없습니다. URL을 확인해 주세요.');
    }

    // Gemini API 호출 (연구용 gemini-2.5-flash 모델 사용)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
      다음 뉴스 본문을 분석해서 아래 형식의 JSON으로만 응답해줘. (다른 텍스트 없이 JSON만 반환)
      - title: 뉴스 제목 (본문에서 추출)
      - category: 뉴스 카테고리 (AI & Robot, 보안, 자율주행, 기타 중 하나 선택)
      - summary: 뉴스 핵심 내용 4줄의 문자열 (각 문장 사이에 줄바꿈 \\n 포함)
      - published_at: 뉴스 발행일 (YYYY-MM-DD 형식, 본문에서 추출하거나 모르면 오늘 날짜)
      
      뉴스 본문:
      ${bodyText}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    // JSON 추출 및 파싱
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다.');
    }
    
    const extractedData = JSON.parse(jsonMatch[0]);

    res.json({ 
      success: true, 
      ...extractedData,
      url: url 
    });
  } catch (error) {
    console.error('Gemini 2.5 Extraction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 모든 경로에 대해 index.html 반환 (SPA 지원)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Integrated server with Gemini 2.5 is running on http://localhost:${PORT}`);
});
