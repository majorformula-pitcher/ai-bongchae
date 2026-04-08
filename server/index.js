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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  try {
    const { data: html } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(html);
    
    // 1. 제목 추출 (메타 태그 우선)
    let title = $('meta[property="og:title"]').attr('content') || 
                $('meta[name="twitter:title"]').attr('content') || 
                $('title').text().trim();

    // 2. 이미지 추출
    let imageUrl = $('meta[property="og:image"]').attr('content') || 
                   $('meta[name="twitter:image"]').attr('content') || "";

    // 3. 날짜 추출
    let publishedAt = $('meta[property="article:published_time"]').attr('content') || 
                      $('meta[name="datePublished"]').attr('content') || 
                      $('time').attr('datetime') || "";

    // 4. 본문 추출 (보내주신 로직 적용)
    const bodySelectors = [
      'div#article-view-content-div', '#articleBody', '.article_body', '.article_txt',
      '#articleBodyContents', '.news_cnt_detail_wrap', '.at-content', 'article', 'main',
      '.entry-content', '.post-content', '.article-body', '.story-body'
    ];

    let bodyElement = null;
    for (const selector of bodySelectors) {
      const el = $(selector);
      if (el.length > 0 && el.text().trim().length > 100) {
        bodyElement = el;
        break;
      }
    }

    // 불필요한 태그 제거 (스크립트, 스타일, 광고 등)
    if (bodyElement) {
      bodyElement.find('script, style, nav, footer, aside, iframe, header, ad').remove();
    }

    let bodyText = bodyElement ? bodyElement.text().trim() : "";

    // 본문 추출 실패 시 p 태그 폴백
    if (bodyText.length < 100) {
      const pTexts = [];
      $('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 40) pTexts.push(text);
      });
      bodyText = pTexts.join('\n');
    }

    // 메타 설명 폴백
    if (bodyText.length < 100) {
      bodyText = $('meta[property="og:description"]').attr('content') || 
                 $('meta[name="description"]').attr('content') || "";
    }

    if (!bodyText || bodyText.length < 50) {
      throw new Error('본문을 추출할 수 없습니다. (페이월 또는 렌더링 제한)');
    }

    // 텍스트 정제 (기자명, 이메일 등 제거)
    bodyText = bodyText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '') // 이메일
                       .replace(/[가-힣]{2,4}\s*기자(?!\w)/g, '') // 기자 이름
                       .slice(0, 5000);

    /* Gemini API 호출 (테스트를 위해 잠시 비활성화)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
      다음 뉴스 본문을 분석해서 아래 형식의 JSON으로만 응답해줘.
      {
        "title": "뉴스 제목",
        "category": "AI & Robot, 보안, 자율주행, 기타 중 하나 선택",
        "summary": "1. 첫 번째 요약\\n2. 두 번째 요약\\n3. 세 번째 요약\\n4. 네 번째 요약",
        "published_at": "YYYY-MM-DD 형식"
      }
      뉴스 본문:
      ${bodyText}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
    
    const extractedData = JSON.parse(jsonMatch[0]);
    */

    // 테스트용 더미 데이터 반환
    const extractedData = {
      title: title || "테스트 뉴스 제목",
      category: "기타",
      summary: "테스트 중",
      published_at: new Date().toISOString().split('T')[0]
    };

    res.json({ 
      success: true, 
      ...extractedData,
      image: imageUrl,
      url: url 
    });
  } catch (error) {
    console.error('Advanced Extraction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Advanced Scraper Server is running on port ${PORT}`);
});
