import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    let title = $('meta[property="og:title"]').attr('content') || 
                $('meta[name="twitter:title"]').attr('content') || 
                $('title').text().trim() || "제목을 찾을 수 없음";

    let imageUrl = $('meta[property="og:image"]').attr('content') || 
                   $('meta[name="twitter:image"]').attr('content') || "";

    let publishedAt = $('meta[property="article:published_time"]').attr('content') || 
                      $('meta[name="datePublished"]').attr('content') || 
                      $('time').attr('datetime') || "";

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
        el.find('script, style, nav, footer, aside, iframe, header, div.not-prose, div.mb-4').remove();
        bodyElement = el;
        break;
      }
    }

    let bodyText = bodyElement ? bodyElement.text().trim() : "";

    if (bodyText.length < 100) {
      const pTexts = [];
      $('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 40) pTexts.push(text);
      });
      if (pTexts.length > 0) bodyText = pTexts.join('\n');
    }

    if (bodyText.length < 100) {
      const metaDesc = $('meta[property="og:description"]').attr('content') || 
                       $('meta[name="description"]').attr('content') || "";
      if (metaDesc) bodyText = metaDesc + (bodyText ? "\n\n" + bodyText : "");
    }

    const botPatterns = ['Are you a robot', '봇 감지', 'Access Denied', 'Attention Required', 'Checking your browser'];
    const isBotPage = botPatterns.some(p => title.toLowerCase().includes(p.toLowerCase()));

    if (isBotPage) {
      throw new Error('Bot detection page detected');
    }

    if (!bodyText || bodyText.length < 50) {
      throw new Error('본문을 추출할 수 없습니다. 페이월이 있거나 JavaScript 렌더링 페이지일 수 있습니다.');
    }

    bodyText = bodyText.replace(/Back to Articles\s*/g, '')
                       .replace(/(?:이메일|email|e-mail)\s*[:\s]*\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
                       .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
                       .replace(/[가-힣]{2,4}\s*기자(?!\w)/g, '')
                       .replace(/\[\s*\]|\(\s*\)/g, '')
                       .split('\n').map(line => line.trim()).filter(line => line).join('\n')
                       .slice(0, 8000);

    let extractedData = {
      title: title && title !== "제목을 찾을 수 없음" ? title : "제목 없음",
      category: "기타",
      summary: "뉴스 본문 추출 성공. (AI 요약 생성 중)",
      published_at: publishedAt || new Date().toISOString().split('T')[0]
    };

    try {
      const isEnglish = /[a-zA-Z]{5,}/.test(title); // 간단한 영문 판별
      
      const prompt = isEnglish 
        ? `다음 영문 뉴스 기사를 읽고 아래 형식에 정확히 맞춰 한국어로 요약해 주세요.

형식:
제목: <기사 제목을 한국어로 번역한 한 줄>
1. <핵심 요약 첫 번째 줄 (한국어)>
2. <핵심 요약 두 번째 줄 (한국어)>
3. <핵심 요약 세 번째 줄 (한국어)>
4. <핵심 요약 네 번째 줄 (한국어)>

주의사항:
- 반드시 '제목:'으로 시작하는 한국어 번역 제목 1줄과 '1.' ~ '4.'으로 시작하는 4개의 한국어 요약 문장을 작성하세요.
- 마크다운 문법을 절대 사용하지 마세요. 순수 텍스트로만 작성하세요.

기사 제목: ${title}
기사 본문: ${bodyText}`
        : `다음 뉴스 기사를 읽고 아래 형식에 정확히 맞춰 4줄로 요약해 주세요.

형식:
1. <핵심 요약 첫 번째 줄>
2. <핵심 요약 두 번째 줄>
3. <핵심 요약 세 번째 줄>
4. <핵심 요약 네 번째 줄>

주의사항:
- 반드시 '1.' ~ '4.'으로 시작하는 4개의 문장으로 구성하세요.
- 불필요한 설명 없이 핵심만 전달하세요.
- 마크다운 문법을 절대 사용하지 마세요. 순수 텍스트로만 작성세요.

기사 제목: ${title}
기사 본문: ${bodyText}`;

      const msg = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: "당신은 뉴스 요약 전문가입니다. 반드시 지정된 형식만 출력하세요.",
        messages: [{ role: "user", content: prompt }],
      });

      let text = msg.content[0].text.trim();
      
      // 텍스트 정제 (사용자 제공 파이썬 로직 이식)
      text = text.replace(/[\*#`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      let summaryLines = [];
      let finalTitle = title;

      for (const line of lines) {
        if (line.startsWith('제목:')) {
          finalTitle = line.replace('제목:', '').trim();
        } else if (/^\d\./.test(line)) {
          summaryLines.push(line);
        }
      }

      if (summaryLines.length > 0) {
        extractedData.title = finalTitle;
        extractedData.summary = summaryLines.slice(0, 4).join('\n');
        extractedData.category = "AI"; // 기본값
      }
    } catch (aiError) {
      console.error('Claude API Error:', aiError);
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
