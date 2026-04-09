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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// AI 요약 함수 - Gemini 로직
async function summarizeWithGemini(bodyText, title) {
  const isEnglish = /[a-zA-Z]{5,}/.test(title);
  const prompt = `
    다음 뉴스 본문을 분석해서 '반드시' 아래 형식의 순수 JSON으로만 응답해줘. 
    설명이나 마크다운 코드 블록(예: \`\`\`json)은 절대 포함하지 마.
    
    {
      "title": "${isEnglish ? "기사 제목의 한국어 번역" : "기사 제목 (이미 추출된 제목을 참고하되 더 명확하게 보강)"}",
      "category": "AI, Robot, 보안, IT, 기타 중 하나를 가장 적절한 것으로 선택",
      "summary": "1. 첫 번째 핵심 요약\\n2. 두 번째 핵심 요약\\n3. 세 번째 핵심 요약\\n4. 네 번째 핵심 요약",
      "published_at": "YYYY-MM-DD"
    }
    
    뉴스 본문:
    ${bodyText}
  `;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  const responseAi = await result.response;
  let responseText = responseAi.text().trim();
  
  const startIdx = responseText.indexOf('{');
  const endIdx = responseText.lastIndexOf('}');
  
  if (startIdx !== -1 && endIdx !== -1) {
    let jsonStr = responseText.substring(startIdx, endIdx + 1);
    const aiData = JSON.parse(jsonStr);
    
    const validCategories = ['AI', 'Robot', '보안', 'IT', '기타'];
    let finalCategory = aiData.category || '기타';
    if (!validCategories.includes(finalCategory)) {
      finalCategory = validCategories.find(c => finalCategory.toUpperCase().includes(c.toUpperCase())) || '기타';
    }

    return {
      title: aiData.title || title,
      category: finalCategory,
      summary: aiData.summary,
      published_at: aiData.published_at || new Date().toISOString().split('T')[0]
    };
  }
  throw new Error("JSON 형식을 찾을 수 없습니다.");
}

// AI 요약 함수 - Claude 로직
async function summarizeWithClaude(bodyText, title) {
  const isEnglish = /[a-zA-Z]{5,}/.test(title);
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
- 마크다운 문법을 절대 사용하지 마세요. 순수 텍스트로만 작성하세요.

기사 제목: ${title}
기사 본문: ${bodyText}`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: "당신은 뉴스 요약 전문가입니다. 반드시 지정된 형식만 출력하세요.",
    messages: [{ role: "user", content: prompt }],
  });

  let text = msg.content[0].text.trim();
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
    return {
      title: finalTitle,
      category: "AI",
      summary: summaryLines.slice(0, 4).join('\n'),
      published_at: new Date().toISOString().split('T')[0]
    };
  }
  throw new Error("4줄 요약 형식을 찾을 수 없습니다.");
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

  try {
    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" };
    const response = await axios.get(url, { headers, timeout: 15000, validateStatus: (status) => status < 500 });
    const html = response.data;
    const status = response.status;
    const $ = cheerio.load(html);

    if (status >= 400) {
      const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      const ogDesc = $('meta[property="og:description"]').attr('content') || "";
      const ogImage = $('meta[property="og:image"]').attr('content') || "";
      if (ogTitle && ogDesc) {
        return res.json({ success: true, title: ogTitle, summary: ogDesc, category: "기타", published_at: new Date().toISOString(), image: ogImage, url });
      }
      throw new Error(`HTTP ${status} — 접근 제한`);
    }

    let title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || "제목 없음";
    let imageUrl = $('meta[property="og:image"]').attr('content') || "";
    let publishedAt = $('meta[property="article:published_time"]').attr('content') || $('time').attr('datetime') || "";

    const bodySelectors = ['div.article_txt', 'div.article_body', 'div#articleBody', 'article', 'main'];
    let bodyText = "";
    for (const s of bodySelectors) {
      const el = $(s);
      if (el.length > 0 && el.text().trim().length > 100) {
        el.find('script, style, nav, footer, aside, iframe, header').remove();
        bodyText = el.text().trim();
        break;
      }
    }
    if (bodyText.length < 100) bodyText = $('meta[property="og:description"]').attr('content') || "";

    if (!bodyText || bodyText.length < 50) throw new Error('본문을 추출할 수 없습니다.');

    bodyText = bodyText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '').replace(/[가-힣]{2,4}\s*기자(?!\w)/g, '').slice(0, 8000);

    let extractedData = { title, category: "기타", summary: "분석 중...", published_at: publishedAt || new Date().toISOString().split('T')[0] };
    let geminiErrorMsg = "";

    // [Step 1] Gemini 시도 (선발 투수 - 무료 티어 최적화)
    try {
      const geminiResult = await summarizeWithGemini(bodyText, title);
      extractedData = { ...extractedData, ...geminiResult };
    } catch (geminiError) {
      console.error('Gemini Failed, switching to Claude fallback:', geminiError.message);
      geminiErrorMsg = geminiError.message;
      
      // [Step 2] Claude 시도 (구원 투수 - 비상용 백업)
      try {
        const claudeResult = await summarizeWithClaude(bodyText, title);
        extractedData = { ...extractedData, ...claudeResult };
        // Gemini 실패 사유를 본문 하단에 작게 기록 (진단용)
        extractedData.summary += `\n\n[Gemini 진단: ${geminiErrorMsg.slice(0, 100)}]`;
      } catch (claudeError) {
        console.error('All AI engines failed:', claudeError.message);
        extractedData.summary = `⚠️ AI 요약 시스템 긴급 점검 중\n- Gemini: ${geminiErrorMsg}\n- Claude: ${claudeError.message}`;
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
