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

    // [Step 5] AI 요약 시도 (실패하더라도 추출된 정보는 반환)
    let extractedData = {
      title: title && title !== "제목을 찾을 수 없음" ? title : "제목 없음",
      category: "기타",
      summary: "뉴스 본문 추출 성공. (AI 요약 생성 중 오류 발생)",
      published_at: publishedAt || new Date().toISOString().split('T')[0]
    };

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
        다음 뉴스 본문을 분석해서 '반드시' 아래 형식의 순수 JSON으로만 응답해줘. 
        설명이나 마크다운 코드 블록(예: \`\`\`json)은 절대 포함하지 마.
        
        {
          "title": "뉴스 제목 (이미 추출된 제목을 참고하되 더 명확하게 보강)",
          "category": "AI, Robot, 보안, IT, 기타 중 하나를 가장 적절한 것으로 선택",
          "summary": "1. 첫 번째 핵심 요약\\n2. 두 번째 핵심 요약\\n3. 세 번째 핵심 요약\\n4. 네 번째 핵심 요약",
          "published_at": "YYYY-MM-DD"
        }
        
        뉴스 본문:
        ${bodyText}
      `;

      const result = await model.generateContent(prompt);
      const responseAi = await result.response;
      let responseText = responseAi.text().trim();
      
      // [무적 파싱 로직] 가장 바깥쪽의 { } 구간만 강제 추출
      const startIdx = responseText.indexOf('{');
      const endIdx = responseText.lastIndexOf('}');
      
      if (startIdx !== -1 && endIdx !== -1) {
        let jsonStr = responseText.substring(startIdx, endIdx + 1);
        try {
          const aiData = JSON.parse(jsonStr);
          
          // 카테고리 강제 매핑 (AI, Robot, 보안, IT, 기타)
          const validCategories = ['AI', 'Robot', '보안', 'IT', '기타'];
          let finalCategory = aiData.category || '기타';
          if (!validCategories.includes(finalCategory)) {
            finalCategory = validCategories.find(c => finalCategory.toUpperCase().includes(c.toUpperCase())) || '기타';
          }

          extractedData = {
            ...extractedData,
            title: title && title !== "제목을 찾을 수 없음" ? title : (aiData.title || extractedData.title),
            category: finalCategory,
            summary: aiData.summary || extractedData.summary,
            published_at: aiData.published_at || extractedData.published_at
          };
        } catch (parseError) {
          console.error('JSON Parse Error in AI step:', parseError, 'Raw JSON:', jsonStr);
        }
      }
    } catch (aiError) {
      console.error('AI Summary Error (Partial Success):', aiError);
      if (bodyText) {
        extractedData.summary = "AI 요약 생성에 실패했습니다. (원본 본문 보존됨)\n\n" + bodyText.slice(0, 200) + "...";
      }
    }

    res.json({ 
      success: true, 
      ...extractedData,
      image: imageUrl,
      url: url 
    });
  } catch (error) {
    console.error('Extraction engine error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Advanced Scraper Server is running on port ${PORT}`);
});
