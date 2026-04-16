import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from '@anthropic-ai/sdk';

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import Database from 'better-sqlite3';

dotenv.config();

const USE_LOCAL_DB = process.env.USE_LOCAL_DB === 'true';
const TABLE_NAME = process.env.TABLE_NAME || 'ai-bongchae';

// [DB 초기화] 로컬 SQLite 설정
let localDb;
if (USE_LOCAL_DB) {
  localDb = new Database('bongchae.dev.db');
  console.log('[DB] Local SQLite initialized (bongchae.dev.db)');
  
  // 테이블 자동 생성 (없을 경우)
  localDb.prepare(`
    CREATE TABLE IF NOT EXISTS "${TABLE_NAME}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      title TEXT,
      summary TEXT,
      url TEXT UNIQUE,
      category TEXT,
      published_at TEXT,
      image TEXT,
      engine TEXT,
      likes INTEGER DEFAULT 0
    )
  `).run();
}

let supabase = null;
if (!USE_LOCAL_DB) {
  supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );
}

const rssParser = new Parser({
  customFields: {
    item: ['pubDate', 'description', ['dc:date', 'pubDate']],
  }
});

const RSS_FEEDS = [
  { name: "로봇신문-AI", url: "https://www.irobotnews.com/rss/S1N2.xml" },
  { name: "로봇신문-로봇", url: "https://www.irobotnews.com/rss/S1N1.xml" },
  { name: "전자신문-AI", url: "http://rss.etnews.com/04046.xml" },
  { name: "전자신문-전자", url: "http://rss.etnews.com/06061.xml" },
  { name: "The AI", url: "https://www.newstheai.com/rss/allArticle.xml" },
  { name: "디지털투데이", url: "https://www.digitaltoday.co.kr/rss/allArticle.xml" },
  { name: "한국경제-IT", url: "https://www.hankyung.com/feed/it" },
  { name: "ZDNet Korea", url: "https://zdnet.co.kr/feed" },
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Wired", url: "https://www.wired.com/feed/category/business/latest/rss" },
  { name: "Techmeme", url: "https://www.techmeme.com/feed.xml" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { name: "한겨레 IT-과학", url: "https://www.hani.co.kr/rss/science/" },
  { name: "경향신문 IT", url: "https://www.khan.co.kr/rss/rssdata/it_news.xml" },
  { name: "블로터(Bloter)", url: "https://www.bloter.net/rss/allArticle.xml" },
  { name: "NYT Technology", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
  { name: "AI타임스", url: "https://www.aitimes.com/rss/allArticle.xml" }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware 및 정적 파일 서빙 설정 (중요: 장애 해결 핵심)
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ----------------------------------------------------
// AI 요약 엔진 및 순차 처리 큐 (Ollama 과부하 방지)
// ----------------------------------------------------
let isOllamaBusy = false;
const ollamaQueue = [];

const processOllamaQueue = async () => {
  if (isOllamaBusy || ollamaQueue.length === 0) return;
  isOllamaBusy = true;
  const { requestFn, resolve, reject } = ollamaQueue.shift();
  try {
    const result = await requestFn();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    isOllamaBusy = false;
    processOllamaQueue();
  }
};

const enqueueOllama = (requestFn) => {
  return new Promise((resolve, reject) => {
    ollamaQueue.push({ requestFn, resolve, reject });
    processOllamaQueue();
  });
};

async function summarizeWithOllama(bodyText, title, publishedAt) {
  return enqueueOllama(() => _summarizeWithOllamaInternal(bodyText, title, publishedAt));
}

async function _summarizeWithOllamaInternal(bodyText, title, publishedAt) {
  const isEnglish = /[a-zA-Z]{5,}/.test(title);
  try {
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
    const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b';

    const systemPrompt = `너는 뉴스 핵심 요약 전문가이다. 
    반드시 한국어만 사용하며, 오직 JSON 데이터만 출력하라.
    요약(summary)은 반드시 3~4개의 문장으로 구성하며, 각 문장 사이에는 줄바꿈(\\n)을 넣어라.
    각 문장의 끝은 반드시 ~임, ~함, ~했음, ~함과 같이 명사형 또는 종결어미로 짧게 끊어라.
    문장 앞에 숫자(1.)나 기호(-, •)를 절대 넣지 마라.`;

    const userPrompt = `
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
    - 각 문장은 '~이다'와 같이 전문적인 완성형 어미를 사용하여 문장으로 작성하세요.
    `;

    console.log(`[Ollama] Requesting summary from ${MODEL}... (Timeout: 90s)`);
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: MODEL,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      format: "json", // Ollama에서 JSON 출력을 강제함
      options: {
        temperature: 0.1,
        num_predict: 500 // 불필요한 수다 방지를 위해 출력 길이 제한
      }
    }, { timeout: 90000 }); // 90초 타임아웃 설정

    console.log('[Ollama] Response received successfully.');
    const modelLabel = MODEL.includes(':') ? MODEL.split(':')[1] : MODEL;
    let rawResponse = response.data.response.trim();
    
    // [Emergency Cleaning] 마크다운 블록 제거 및 JSON 추출
    if (rawResponse.includes('```json')) {
      rawResponse = rawResponse.split('```json')[1].split('```')[0].trim();
    } else if (rawResponse.includes('```')) {
      rawResponse = rawResponse.split('```')[1].split('```')[0].trim();
    }

    let aiData;
    try {
      aiData = JSON.parse(rawResponse);
    } catch (parseErr) {
      console.warn('[Ollama] Standard JSON parse failed, attempting emergency fix...');
      try {
        const cleanResponse = rawResponse
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
          .replace(/\\"/g, '"')
          .replace(/"/g, '\"');
        aiData = JSON.parse(cleanResponse);
      } catch (e) {
        throw new Error(`AI 응답 형식 오류: ${parseErr.message}\n응답원본: ${rawResponse.slice(0, 100)}...`);
      }
    }

    // 유연한 유효성 검사: 문자열이든 배열이든 통과
    const summaryRaw = aiData?.summary;
    const summaryIsEmpty = !summaryRaw ||
      (typeof summaryRaw === 'string' && summaryRaw.trim().length < 5) ||
      (Array.isArray(summaryRaw) && summaryRaw.filter(s => s?.trim()).length === 0);

    if (!aiData || summaryIsEmpty) {
      console.error('[Ollama] Validation Failed. Raw Response:', rawResponse);
      throw new Error('AI 요약 데이터가 누락되었거나 형식이 올바르지 않습니다.');
    }

    let rawStr = Array.isArray(summaryRaw) ? summaryRaw.join('\n') : String(summaryRaw);
    let sumLines = rawStr.split('\n');

    aiData.summary = sumLines
      .map(line => line.replace(/^\d+[\.\s-]*\s*/, '').trim())
      .filter(l => l)
      .join('\n');

    return {
      ...aiData,
      engine: `Local Qwen 2.5 (${modelLabel})`
    };
  } catch (err) {
    console.error('[Ollama] Error:', err.message);
    throw err; 
  }
}


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
 - 반드시 각 문장 뒤에 줄바꿈(\\n)을 넣어 4개의 별도 문장으로 구성하세요.
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

    let extractedData = { title, category: "기타", summary: "", published_at: publishedAt || new Date().toISOString().split('T')[0] };
    let geminiErrorMsg = "";
    let ollamaErrorMsg = "";
    let engine = "";

    // [Step 1] Ollama (Local AI) 시도 - 로컬 환경에서만 우선 시도
    let ollamaAttempted = false;
    if (USE_LOCAL_DB || process.env.ENABLE_OLLAMA === 'true') {
      ollamaAttempted = true;
      try {
        console.log('[AI] Attempting Local Ollama (Qwen 2.5)...');
        // 로컬 AI 부하 경감을 위해 본문 길이를 4,000자로 제한
        const liteBodyText = bodyText.slice(0, 4000);
        const ollamaResult = await summarizeWithOllama(liteBodyText, title, publishedAt);
        extractedData = { ...extractedData, ...ollamaResult };
        engine = ollamaResult.engine;
      } catch (ollamaErr) {
        console.warn('[AI] Local AI failed:', ollamaErr.message);
        ollamaErrorMsg = ollamaErr.message;

        // 로컬 전용 모드일 경우 여기서 중단
        if (USE_LOCAL_DB) {
          throw new Error(`로컬 Qwen 요약 실패: ${ollamaErr.message} (로컬 전용 모드 활성 중)`);
        }
      }
    }

    // [Step 2 & 3] 외부 API (Gemini/Claude) 시도 - Ollama 실패했거나 결과를 받지 못했을 경우
    if (!engine) {
      try {
        // ... (Gemini/Claude 로직)
        const geminiResult = await summarizeWithGemini(bodyText, title, publishedAt);
        extractedData = { ...extractedData, ...geminiResult };
        engine = "Gemini";
      } catch (geminiError) {
        console.error('Gemini Failed, switching to Claude fallback:', geminiError.message);
        geminiErrorMsg = geminiError.message;
        
        // [Step 3] Claude 시도
        try {
          const claudeResult = await summarizeWithClaude(bodyText, title, publishedAt);
          extractedData = { ...extractedData, ...claudeResult };
          engine = "Claude";
          // 실패 사유 기록
          extractedData.summary += `\n\n[Diagnosis: Local(${ollamaErrorMsg.slice(0,30)}) / Gemini(${geminiErrorMsg.slice(0,30)})]`;
        } catch (claudeError) {
          console.error('All AI engines failed:', claudeError.message);
          extractedData.summary = `⚠️ AI 요약 시스템 긴급 점검 중\n- Local: ${ollamaErrorMsg}\n- Gemini: ${geminiErrorMsg}\n- Claude: ${claudeError.message}`;
          engine = "Error";
        }
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
      console.log('[API] Attempting Local Ollama for Text Summary...');
      result = await summarizeWithOllama(text, targetTitle);
      engine = result.engine;
    } catch (ollamaErr) {
      console.warn('[API] Local AI failed:', ollamaErr.message);
      
      if (USE_LOCAL_DB) {
        throw new Error(`로컬 요약 실패: ${ollamaErr.message}`);
      }

      try {
        result = await summarizeWithGemini(text, targetTitle);
      } catch (geminiError) {
        console.warn('[API] Gemini text summarize failed, trying Claude:', geminiError.message);
        result = await summarizeWithClaude(text, targetTitle);
        engine = "Claude";
      }
    }
    
    res.json({ success: true, ...result, engine });
  } catch (error) {
    console.error('[API] Text summarization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// [신규 API] 뉴스 목록 전체 조회
app.get('/api/news', async (req, res) => {
  try {
    if (USE_LOCAL_DB) {
      const rows = localDb.prepare(`SELECT * FROM "${TABLE_NAME}" ORDER BY created_at DESC`).all();
      // SQLite의 0/1 값을 boolean으로 변환
      const data = rows.map(r => ({ ...r, likes: !!r.likes }));
      return res.json({ success: true, data });
    } else {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, data });
    }
  } catch (error) {
    console.error('[API] Fetch News Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// [신규 API] 뉴스 추가 (서버에서 DB 직접 입력)
app.post('/api/news', async (req, res) => {
  const newsData = req.body;
  try {
    if (USE_LOCAL_DB) {
      const stmt = localDb.prepare(`
        INSERT INTO "${TABLE_NAME}" (title, summary, url, category, published_at, image, engine, likes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        newsData.title,
        newsData.summary,
        newsData.url,
        newsData.category,
        newsData.published_at,
        newsData.image,
        newsData.engine,
        newsData.likes ? 1 : 0
      );
      // 저장된 데이터 다시 조회해서 반환
      const saved = localDb.prepare(`SELECT * FROM "${TABLE_NAME}" WHERE id = ?`).get(info.lastInsertRowid);
      return res.json({ success: true, data: [{ ...saved, likes: !!saved.likes }] });
    } else {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert([newsData])
        .select();
      if (error) throw error;
      res.json({ success: true, data });
    }
  } catch (error) {
    console.error('[API] Insert News Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// [신규 API] 뉴스 삭제
app.delete('/api/news/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (USE_LOCAL_DB) {
      localDb.prepare(`DELETE FROM "${TABLE_NAME}" WHERE id = ?`).run(id);
      return res.json({ success: true });
    } else {
      const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    }
  } catch (error) {
    console.error('[API] Delete News Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// [기능 변경] 좋아요 토글 Proxy (기존 API 확장)
app.patch('/api/news/:id/like', async (req, res) => {
  const { id } = req.params;
  const { currentStatus } = req.body;
  
  try {
    if (USE_LOCAL_DB) {
      localDb.prepare(`UPDATE "${TABLE_NAME}" SET likes = ? WHERE id = ?`).run(currentStatus ? 0 : 1, id);
      const updated = localDb.prepare(`SELECT * FROM "${TABLE_NAME}" WHERE id = ?`).get(id);
      return res.json({ success: true, data: [{ ...updated, likes: !!updated.likes }] });
    } else {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({ likes: !currentStatus })
        .eq('id', id)
        .select();
      if (error) throw error;
      res.json({ success: true, data });
    }
  } catch (error) {
    console.error('[API] Like Toggle Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/rss-feeds', (req, res) => {
  res.json({ success: true, feeds: RSS_FEEDS.map((f, i) => ({ id: i, name: f.name })) });
});

app.get('/api/rss/:id', async (req, res) => {
  const feedId = parseInt(req.params.id);
  if (isNaN(feedId) || !RSS_FEEDS[feedId]) {
    return res.status(404).json({ success: false, error: "Feed not found" });
  }

  const feedConfig = RSS_FEEDS[feedId];

  try {
    const response = await axios.get(feedConfig.url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36' 
      },
      timeout: 10000
    });
    const feed = await rssParser.parseString(response.data);
    const items = feed.items.slice(0, 50).map(item => {
      let link = item.link || item.guid;
      let originalUrl = null;

      // [Special Case] Techmeme 원본 URL 추출 (사용자 파이썬 로직 이식)
      if (feedConfig.name === "Techmeme" && item.content) {
        const $ = cheerio.load(item.content);
        const aTag = $('span a').first();
        if (aTag.length && !aTag.attr('href').includes('techmeme.com')) {
          link = aTag.attr('href');
          originalUrl = link;
        }
      }

      return {
        title: item.title,
        link: link,
        pubDate: item.pubDate || item['dc:date'] || item.isoDate || feed.lastBuildDate || new Date().toISOString(),
        summary: item.contentSnippet || item.description || "",
        originalUrl
      };
    });

    // DB 중복 체크
    const urls = items.map(it => it.link);
    let existingUrls = new Set();

    if (USE_LOCAL_DB) {
      // SQLite에서 해당 URL들이 있는지 확인
      const placeholders = urls.map(() => '?').join(',');
      const rows = localDb.prepare(`SELECT url FROM "${TABLE_NAME}" WHERE url IN (${placeholders})`).all(...urls);
      existingUrls = new Set(rows.map(r => r.url));
    } else {
      const { data: existingNews } = await supabase
        .from(TABLE_NAME)
        .select('url')
        .in('url', urls);
      existingUrls = new Set((existingNews || []).map(n => n.url));
    }
    
    const finalItems = items.map(it => ({
      ...it,
      isAdded: existingUrls.has(it.link)
    }));

    res.json({ success: true, channel: feed.title, items: finalItems });
  } catch (error) {
    console.error(`[RSS] Error fetching ${feedConfig.name}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 이미지 보안 우회용 프록시 API
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL is required');

  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': new URL(url).origin
      },
      timeout: 5000 // 5초 타임아웃
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // 1일간 캐시
    res.send(response.data);
  } catch (error) {
    console.error('Image Proxy Error:', error.message);
    // 실패 시 404 또는 에러 이미지를 보낼 수 있지만, 일단은 500 에러를 반환
    res.status(500).send('Failed to fetch image');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Advanced Scraper Server is running on port ${PORT}`);
});
