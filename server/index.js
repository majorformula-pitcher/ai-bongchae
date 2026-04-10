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

// AI 요약 함수 - Gemini 로직 (REST API 직통 호출 방식)
async function summarizeWithGemini(bodyText, title, publishedAt) {
  const isEnglish = /[a-zA-Z]{5,}/.test(title);
  const prompt = `
    다음 뉴스 본문을 분석해서 '반드시' 아래 형식의 순수 JSON으로만 응답해줘. 
    설명이나 마크다운 코드 블록(예: \`\`\`json)은 절대 포함하지 마.
    
    {
      "title": "${isEnglish ? "기사 제목의 한국어 번역" : "기사 제목 (매체명이나 사이트 이름은 반드시 제거하고 핵심 헤드라인만 명확하게 보강)"}",
      "category": "AI, Robot, 보안, IT, 기타 중 하나를 가장 적절한 것으로 선택",
      "summary": "첫 번째 핵심 요약\\n두 번째 핵심 요약\\n세 번째 핵심 요약\\n네 번째 핵심 요약",
      "published_at": "${publishedAt || new Date().toISOString().split('T')[0]}"
    }
    
    주의: 기사 발행일 힌트가 "${publishedAt || '날짜 정보 없음'}" 이므로, 이를 우선적으로 참고하세요.
    
    뉴스 본문:
    ${bodyText}
    
    주의사항:
    - 요약(summary)은 반드시 숫자를 붙이지 말고 4개의 핵심 문장으로만 작성하세요. (각 문장은 줄바꿈으로 구분)
  `;

  const API_KEY = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    }
  };

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.data.candidates || response.data.candidates.length === 0) {
      throw new Error("Gemini 응답 후보가 없습니다.");
    }

    const responseText = response.data.candidates[0].content.parts[0].text.trim();
    
    const startIdx = responseText.indexOf('{');
    const endIdx = responseText.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1) {
      let jsonStr = responseText.substring(startIdx, endIdx + 1);
      let aiData = JSON.parse(jsonStr);
      
      const validCategories = ['AI', 'Robot', '보안', 'IT', '기타'];
      let finalCategory = aiData.category || '기타';
      if (!validCategories.includes(finalCategory)) {
        finalCategory = validCategories.find(c => finalCategory.toUpperCase().includes(c.toUpperCase())) || '기타';
      }

      // 숫자가 포함되어 올 경우를 대비한 정제
      let cleanSummary = (aiData.summary || '').split('\n').map(line => line.replace(/^\d+[\.\s-]*\s*/, '').trim()).filter(l => l).join('\n');

      // 날짜 유효성 검사 (YYYY-MM-DD 형식이 아니면 오늘 날짜 사용)
      let finalDate = aiData.published_at;
      const dateRegex = /^\d{4}-\d{2}-\d{2}/;
      if (!finalDate || !dateRegex.test(finalDate) || finalDate.includes('YYYY')) {
        finalDate = new Date().toISOString().split('T')[0];
      }

      return {
        title: aiData.title || title,
        category: finalCategory,
        summary: cleanSummary,
        published_at: finalDate
      };
    }
    throw new Error("JSON 형식을 찾을 수 없습니다.");
  } catch (err) {
    if (err.response) {
      console.error('[Gemini API Error] Status:', err.response.status);
      console.error('[Gemini API Error] Data:', JSON.stringify(err.response.data, null, 2));
      throw new Error(`Gemini API Error (${err.response.status}): ${err.response.data.error?.message || 'Unknown error'}`);
    }
    throw err;
  }
}

// AI 요약 함수 - Claude 로직
async function summarizeWithClaude(bodyText, title, publishedAt) {
  const isEnglish = /[a-zA-Z]{5,}/.test(title);
  const prompt = isEnglish 
    ? `다음 영문 뉴스 기사를 읽고 아래 형식에 정확히 맞춰 한국어로 요약해 주세요.

형식:
제목: <기사 제목을 한국어로 번역한 한 줄 (신문사 이름 등 접미사 절대 금지)>
카테고리: <AI, Robot, 보안, IT, 기타 중 가장 적절한 하나 선택>
<핵심 요약 첫 번째 문장 (한국어)>
<핵심 요약 두 번째 문장 (한국어)>
<핵심 요약 세 번째 문장 (한국어)>
<핵심 요약 네 번째 문장 (한국어)>

주의사항:
- 반드시 '제목:'으로 시작하는 한국어 번역 제목 1줄과 숫자가 없는 4개의 핵심 문장으로 작성하세요.
- 마크다운 문법을 절대 사용하지 마세요. 1., 2. 같은 숫자를 붙이지 마세요.

  기사 제목: ${title}
  기사 발행일 힌트: ${publishedAt || '발행일 정보 없음'}
  기사 본문: ${bodyText}`
    : `다음 뉴스 기사를 읽고 아래 형식에 정확히 맞춰 4줄의 핵심 요약으로 한국어로 요약해 주세요.
 
 형식:
 <요약 문장 1>
 <요약 문장 2>
 <요약 문장 3>
 <요약 문장 4>
 카테고리: <AI, Robot, 보안, IT, 기타 중 하나 선택>
 
 주의사항:
 - 반드시 각 문장 뒤에 줄바꿈(\n)을 넣어 4개의 별도 문장으로 구성하세요.
 - 1., 2. 같은 숫자나 불렛 기호(-, *)를 절대 붙이지 마세요.
 - 서론과 결론 없이 오직 4줄의 요약 내용만 출력하세요.
 
 기사 제목: ${title}
 기사 발행일 힌트: ${publishedAt || '발행일 정보 없음'}
 기사 본문: ${bodyText}`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: "당신은 뉴스 요약 전문가입니다. 숫자를 사용하지 말고 문장 위주로만 출력하세요.",
    messages: [{ role: "user", content: prompt }],
  });

  let text = msg.content[0].text.trim();
  text = text.replace(/[\*#`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let finalTitle = title;
  let finalCategory = "기타";

  // 만약 줄바꿈이 제대로 안 되어 한 문단으로 왔을 경우를 대비한 문장 분리 로직
  let finalLines = [];
  for (const line of lines) {
    if (line.startsWith('제목:')) {
      finalTitle = line.replace('제목:', '').trim();
    } else if (line.startsWith('카테고리:')) {
      const cat = line.replace('카테고리:', '').trim();
      const validCategories = ['AI', 'Robot', '보안', 'IT', '기타'];
      finalCategory = validCategories.find(v => cat.toUpperCase().includes(v.toUpperCase())) || "기타";
    } else {
      // 마침표(.)를 기준으로 문장이 뭉쳐있을 경우 쪼갬
      const sentences = line.split(/(?<=\.)\s+/);
      for (const sent of sentences) {
        const cleanSent = sent.replace(/^[\d\.\s\-\*•]+/, '').trim();
        if (cleanSent) finalLines.push(cleanSent);
      }
    }
  }

  // 최종 요약문 구성 (최대 4줄 보장)
  const summaryLines = finalLines.slice(0, 4);

  if (summaryLines.length > 0) {
    return {
      title: finalTitle,
      category: finalCategory,
      summary: summaryLines.slice(0, 4).join('\n'),
      published_at: publishedAt || new Date().toISOString().split('T')[0]
    };
  }
  throw new Error("요약 형식을 찾을 수 없습니다.");
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

  try {
    const headers = { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": url.includes('naver.com') ? "https://news.naver.com/" : "https://www.google.com/",
      "DNT": "1",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Ch-Ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-User": "?1"
    };
    
    console.log(`[Crawler] Attempting to fetch: ${url}`);
    const response = await axios.get(url, { headers, timeout: 15000, validateStatus: (status) => status < 500 });
    const html = response.data;
    const status = response.status;
    const $ = cheerio.load(html);

    if (status >= 400) {
      console.warn(`[Crawler] Low-level block detected (HTTP ${status}). Trying OG fallback.`);
      const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      const ogDesc = $('meta[property="og:description"]').attr('content') || "";
      const ogImage = $('meta[property="og:image"]').attr('content') || "";
      if (ogTitle && ogDesc) {
        return res.json({ success: true, title: ogTitle, summary: ogDesc, category: "기타", published_at: new Date().toISOString(), image: ogImage, url, engine: "Fallback" });
      }
      throw new Error(`HTTP ${status} — 접근 제한 (사이트에서 직접 차단함)`);
    }

    let title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || "제목 없음";
    
    // [제목 세척 고도화] 매체명 접미사 제거 ( - , | , : , / 등)
    if (title.includes(' - ')) title = title.split(' - ').slice(0, -1).join(' - ');
    else if (title.includes(' | ')) title = title.split(' | ').slice(0, -1).join(' | ');
    else if (title.includes(' : ')) title = title.split(' : ').slice(0, -1).join(' : ');
    
    title = title.trim();
    
    let imageUrl = $('meta[property="og:image"]').attr('content') || "";
    
    // [날짜 추출 고도화] 여러 메타 태그와 네이버 전용 선택자 뒤지기
    let rawDate = $('meta[name="news-article-recently-created"]').attr('content') || 
                  $('meta[property="article:published_time"]').attr('content') || 
                  $('meta[name="pubdate"]').attr('content') ||
                  $('meta[name="publish-date"]').attr('content') ||
                  $('[data-date-time]').first().attr('data-date-time') || // Naver 신규 태그
                  $('.media_end_head_info_dateline_ts').attr('data-last-updated') ||
                  $('.media_end_head_info_dateline_ts').text().replace(/입력|수정/g, '').trim() ||
                  $('time').attr('datetime') || "";
    
    let publishedAt = "";

    // [Step 1] YYYYMMDDHHmmss 형식 처리 (네이버 전용)
    if (rawDate && /^\d{14}$/.test(rawDate)) {
      publishedAt = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}T${rawDate.slice(8,10)}:${rawDate.slice(10,12)}:${rawDate.slice(12,14)}+09:00`;
    } 
    // [Step 2] YYYY-MM-DD HH:mm:ss 형식 처리
    else if (rawDate && /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(rawDate)) {
      publishedAt = rawDate.replace(' ', 'T') + "+09:00";
    }
    // [Step 3] YYYY.MM.DD. 오전/오후 HH:mm 형식 처리
    else if (rawDate && rawDate.includes('.')) {
      const dateMatch = rawDate.match(/(\d{4})\.(\d{2})\.(\d{2})/);
      const timeMatch = rawDate.match(/(오전|오후)\s*(\d{1,2}):(\d{1,2})/);
      
      if (dateMatch) {
        let year = dateMatch[1];
        let month = dateMatch[2];
        let day = dateMatch[3];
        let hour = "00";
        let min = "00";
        
        if (timeMatch) {
          let h = parseInt(timeMatch[2]);
          let isPM = timeMatch[1] === '오후';
          if (isPM && h < 12) h += 12;
          if (!isPM && h === 12) h = 0;
          hour = h.toString().padStart(2, '0');
          min = timeMatch[3].padStart(2, '0');
        }
        publishedAt = `${year}-${month}-${day}T${hour}:${min}:00+09:00`;
      }
    }

    // [Fallback] 정제가 실패했으나 rawDate가 ISO와 유사한 경우
    if (!publishedAt && rawDate && rawDate.length > 10) {
      publishedAt = rawDate;
    }
    
    // 최종 검증: 여전히 비어있으면 오늘 날짜
    if (!publishedAt) {
      publishedAt = new Date().toISOString();
    }

    // 진일보한 본문 셀렉터 (해외 매체 대응 포함)
    const bodySelectors = [
      'div.article-content', 'div.post-content', 'div.content-lock-content', 
      'div.article_txt', 'div.article_body', 'div#articleBody', 
      'article', 'main', '.entry-content', '.story-content', 'div.article-body-content'
    ];
    let bodyText = "";

    // [Method 1] JSON-LD ArticleBody 추출 (가장 강력한 차단 우회법)
    try {
      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const jsonText = $(el).text();
          const jsonData = JSON.parse(jsonText);
          
          const findArticleBody = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            if (Array.isArray(obj)) {
              for (const item of obj) {
                const result = findArticleBody(item);
                if (result) return result;
              }
            }
            if (obj.articleBody && obj.articleBody.length > 200) return obj.articleBody;
            for (const key in obj) {
              const result = findArticleBody(obj[key]);
              if (result) return result;
            }
            return null;
          };

          const foundText = findArticleBody(jsonData);
          if (foundText) {
            bodyText = foundText;
            console.log(`[Crawler] Success! Article content extracted via JSON-LD (${bodyText.length} chars)`);
            return false; // break each
          }
        } catch (e) { /* ignore parse errors */ }
      });
    } catch (ldError) {
      console.error('[Crawler] JSON-LD extraction failed:', ldError.message);
    }

    // [Method 2] DOM Selector 추출 (JSON-LD 실패 시)
    if (!bodyText || bodyText.length < 200) {
      for (const s of bodySelectors) {
        const el = $(s);
        if (el.length > 0) {
          el.find('script, style, nav, footer, aside, iframe, header, button, .ad-unit, .promo-box, .newsletter-signup').remove();
          const text = el.text().trim();
          if (text.length > 200) {
            bodyText = text;
            console.log(`[Crawler] Content extracted via selector: ${s} (${bodyText.length} chars)`);
            break;
          }
        }
      }
    }
    
    // [Method 3] OG Description Fallback
    if (bodyText.length < 100) {
      console.log(`[Crawler] Selectors failed or short. Using OG Description.`);
      bodyText = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || "";
    }

    if (!bodyText || bodyText.length < 50) throw new Error('본문을 추출할 수 없습니다. (사이트 차단 또는 구조 변경)');

    // 텍스트 정제 (불필요한 공백 및 로고 문구 제거)
    bodyText = bodyText
      .replace(/\s+/g, ' ')
      .replace(/[a-zA-Z0-9._%+-]+@ businessinsider\.com/g, '') // 특정 매체 이메일 제거
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/[가-힣]{2,4}\s*기자(?!\w)/g, '')
      .slice(0, 8000);

    let extractedData = { title, category: "기타", summary: "분석 중...", published_at: publishedAt || new Date().toISOString().split('T')[0] };
    let geminiErrorMsg = "";
    let engine = "";

    // [Step 1] Gemini 시도
    try {
      const geminiResult = await summarizeWithGemini(bodyText, title, publishedAt);
      extractedData = { ...extractedData, ...geminiResult };
      engine = "Gemini";
    } catch (geminiError) {
      console.error('Gemini Failed, switching to Claude fallback:', geminiError.message);
      geminiErrorMsg = geminiError.message;
      
      // [Step 2] Claude 시도
      try {
        const claudeResult = await summarizeWithClaude(bodyText, title, publishedAt);
        extractedData = { ...extractedData, ...claudeResult };
        engine = "Claude";
        // Gemini 실패 사유를 본문 하단에 작게 기록 (진단용)
        extractedData.summary += `\n\n[Gemini 진단: ${geminiErrorMsg.slice(0, 100)}]`;
      } catch (claudeError) {
        console.error('All AI engines failed:', claudeError.message);
        extractedData.summary = `⚠️ AI 요약 시스템 긴급 점검 중\n- Gemini: ${geminiErrorMsg}\n- Claude: ${claudeError.message}`;
        engine = "Error";
      }
    }

    res.json({ 
      success: true, 
      ...extractedData,
      engine,
      image: imageUrl,
      url: url 
    });
  } catch (error) {
    console.error('Extraction engine error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/summarize-text', express.json({ limit: '10mb' }), async (req, res) => {
  const { text, title } = req.body;
  if (!text || text.length < 20) {
    return res.status(400).json({ success: false, error: '요약할 본문 내용이 너무 짧습니다. (최소 20자 이상)' });
  }

  try {
    let result;
    let engine = "Gemini";
    const targetTitle = title || '직접 입력한 뉴스';
    
    try {
      result = await summarizeWithGemini(text, targetTitle);
    } catch (geminiError) {
      console.warn('[API] Gemini text summarize failed, trying Claude:', geminiError.message);
      result = await summarizeWithClaude(text, targetTitle);
      engine = "Claude";
    }
    
    res.json({ success: true, ...result, engine });
  } catch (error) {
    console.error('[API] Text summarization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Advanced Scraper Server is running on port ${PORT}`);
});
