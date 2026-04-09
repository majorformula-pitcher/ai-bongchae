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
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ko-KR;q=0.8,ko;q=0.7",
      "Accept-Encoding": "gzip, deflate",
      "Cache-Control": "no-cache",
    };

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
      validateStatus: (status) => status < 500
    });
    
    const html = response.data;
    const status = response.status;
    const $ = cheerio.load(html);

    // 403/401 등 차단 시 메타 정보만이라도 추출 시도
    if (status >= 400) {
      const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      const ogDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || "";
      const ogImage = $('meta[property="og:image"]').attr('content') || "";

      if (ogTitle && ogDesc) {
        const reason = "[페이월/접근 제한] 전체 본문을 가져올 수 없어 요약 정보만 표시합니다.";
        return res.json({
          success: true,
          title: ogTitle,
          summary: reason + "\n\n" + ogDesc,
          category: "기타",
          published_at: new Date().toISOString(),
          image: ogImage,
          url: url
        });
      }
      
      let errorMsg = `HTTP ${status} — 서버에서 요청을 거부했습니다.`;
      if (status === 403) errorMsg = "HTTP 403 Forbidden — 이 사이트는 봇 접근을 차단하고 있습니다.";
      if (status === 401) errorMsg = "HTTP 401 Unauthorized — 로그인이 필요한 페이지입니다.";
      throw new Error(errorMsg);
    }

    // 1. 제목 추출 (meta 태그 우선)
    let title = $('meta[property="og:title"]').attr('content') || 
                $('meta[name="twitter:title"]').attr('content') || 
                $('title').text().trim() || "제목을 찾을 수 없음";

    // 2. 이미지 추출
    let imageUrl = $('meta[property="og:image"]').attr('content') || 
                   $('meta[name="twitter:image"]').attr('content') || "";

    // 3. 날짜 추출
    let publishedAt = $('meta[property="article:published_time"]').attr('content') || 
                      $('meta[name="datePublished"]').attr('content') || 
                      $('time').attr('datetime') || "";

    // 4. 본문 추출 (파이썬 로직의 body_selectors 이식)
    const bodySelectors = [
      'div.article_txt', 'div.article_body', 'div#articleBody',
      'div#article-view-content-div', 'div.news_cnt_detail_wrap',
      'div.wp-block-post-content', '[itemprop="articleBody"]', 'div.article-body', 'div.article__body',
      'div.story-body', 'div.article-content', 'div.post-content', 'div.body-content', 'section.article-body',
      'div[data-component="text-block"]', '#center', 'div.field-item', 'div.node-content',
      'div.entry-content', 'div.blog-content', 'main article', 'article', 'div.content', 'main'
    ];

    let bodyElement = null;
    for (const selector of bodySelectors) {
      const el = $(selector);
      if (el.length > 0 && el.text().trim().length > 100) {
        // 불필요한 태그 제거
        el.find('script, style, nav, footer, aside, iframe, header, div.not-prose, div.mb-4').remove();
        bodyElement = el;
        break;
      }
    }

    let bodyText = bodyElement ? bodyElement.text().trim() : "";

    // [Fallback 1] p 태그 수집
    if (bodyText.length < 100) {
      const pTexts = [];
      $('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 40) pTexts.push(text);
      });
      if (pTexts.length > 0) bodyText = pTexts.join('\n');
    }

    // [Fallback 2] 메타 설명 수집
    if (bodyText.length < 100) {
      const metaDesc = $('meta[property="og:description"]').attr('content') || 
                       $('meta[name="description"]').attr('content') || "";
      if (metaDesc) bodyText = metaDesc + (bodyText ? "\n\n" + bodyText : "");
    }

    // 실제 기사가 아닌 봇 감지 페이지인 경우 실패 처리
    const botPatterns = ['Are you a robot', '봇 감지', 'Access Denied', 'Attention Required', 'Checking your browser'];
    const isBotPage = botPatterns.some(p => title.toLowerCase().includes(p.toLowerCase()));

    if (isBotPage) {
      throw new Error('Bot detection page detected');
    }

    if (!bodyText || bodyText.length < 50) {
      throw new Error('본문을 추출할 수 없습니다. 페이월이 있거나 JavaScript 렌더링 페이지일 수 있습니다.');
    }

    // 텍스트 정제 (파이썬 정규표현식 이식)
    bodyText = bodyText.replace(/Back to Articles\s*/g, '')
                       .replace(/(?:이메일|email|e-mail)\s*[:\s]*\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
                       .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
                       .replace(/[가-힣]{2,4}\s*기자(?!\w)/g, '')
                       .replace(/\[\s*\]|\(\s*\)/g, '')
                       .split('\n').map(line => line.trim()).filter(line => line).join('\n')
                       .slice(0, 5000);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
      다음 뉴스 본문을 분석해서 아래 형식의 JSON으로만 응답해줘. (반드시 순수 JSON만 출력)
      {
        "title": "뉴스 제목 (추출된 제목이 있으면 사용, 본문 기반으로 보강 가능)",
        "category": "AI, Robot, 보안, IT, 기타 중 하나 선택",
        "summary": "1. 첫 번째 요약\\n2. 두 번째 요약\\n3. 세 번째 요약\\n4. 네 번째 요약 (최대한 구체적이고 전문적으로)",
        "published_at": "YYYY-MM-DD 형식 (추출된 날짜가 있으면 사용, 없으면 오늘 날짜)"
      }
      뉴스 본문:
      ${bodyText}
    `;

    const result = await model.generateContent(prompt);
    const responseAi = await result.response;
    const responseText = responseAi.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
    
    const extractedData = JSON.parse(jsonMatch[0]);

    res.json({ 
      success: true, 
      ...extractedData,
      title: title && title !== "제목을 찾을 수 없음" ? title : (extractedData.title || title),
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
