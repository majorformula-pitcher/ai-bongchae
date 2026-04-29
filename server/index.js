import express from 'express';
import { Resend } from 'resend';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from '@anthropic-ai/sdk';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';


import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import Database from 'better-sqlite3';

dotenv.config();

// const resend = new Resend(process.env.RESEND_API_KEY); // 멀티 계정 발송을 위해 핸들러 내부에서 동적으로 생성합니다.

const USE_LOCAL_DB = process.env.USE_LOCAL_DB === 'true';
const TABLE_NAME = process.env.TABLE_NAME || 'ai-bongchae';

// [Utility] URL 정규화 (중복 방지용)
function normalizeUrl(url) {
  if (!url) return url;
  try {
    let clean = url.trim();
    // 1. 프로토콜 통일 (http -> https)
    clean = clean.replace(/^http:\/\//i, 'https://');
    // 2. 끝 슬래시 제거
    clean = clean.replace(/\/+$/, '');
    return clean;
  } catch (e) {
    return url;
  }
}

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

  localDb.prepare(`
    CREATE TABLE IF NOT EXISTS "ai_news_publish" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      url TEXT UNIQUE,
      title_ko TEXT,
      summary_ko TEXT,
      title_eng TEXT,
      summary_eng TEXT,
      engine TEXT
    )
  `).run();

  try {
    localDb.prepare(`ALTER TABLE "ai_news_publish" ADD COLUMN engine TEXT`).run();
  } catch (alterErr) {
    // 이미 컬럼이 존재할 경우 에러가 나므로 무시합니다.
  }

  try {
    localDb.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_news_publish_url" ON "ai_news_publish" (url)`).run();
  } catch (idxErr) {
    console.warn('[DB] Unique index on ai_news_publish failed (duplicates may exist):', idxErr.message);
  }
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
  { name: "로봇신문", url: "https://www.irobotnews.com/rss/allArticle.xml" },
  { name: "전자신문-AI", url: "http://rss.etnews.com/04046.xml" },
  { name: "전자신문-전자", url: "http://rss.etnews.com/06061.xml" },
  { name: "The AI", url: "https://www.newstheai.com/rss/allArticle.xml" },
  { name: "디지털투데이", url: "https://www.digitaltoday.co.kr/rss/allArticle.xml" },
  { name: "한국경제-IT", url: "https://www.hankyung.com/feed/it" },
  { name: "Bloter", url: "https://www.bloter.net/rss/allArticle.xml" },
  { name: "AI타임스", url: "https://www.aitimes.com/rss/allArticle.xml" },
  { name: "ZDNet Korea", url: "https://zdnet.co.kr/feed" },
  { name: "더밀크", url: "https://news.google.com/rss/search?q=when:24h+site:themiilk.com&hl=ko&gl=KR&ceid=KR:ko" },
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Wired", url: "https://www.wired.com/feed/category/business/latest/rss" },
  { name: "CNET", url: "https://www.cnet.com/rss/all/" },
  { name: "DigitalTrends", url: "https://www.digitaltrends.com/feed/" },
  { name: "The Guardian", url: "https://www.theguardian.com/uk/technology/rss" },
  { name: "VentureBeat", url: "https://venturebeat.com/feed" },
  { name: "Techmeme", url: "https://www.techmeme.com/feed.xml" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Google Research", url: "https://research.google/blog/rss/" },
  { name: "9to5", url: "https://9to5google.com/guides/google/feed/" },
  { name: "MIT", url: "https://news.mit.edu/rss/feed" },
  { name: "Bloomberg", url: "https://news.google.com/rss/search?q=when:24h+allinurl:bloomberg.com+(AI+OR+Robot+OR+Security+OR+Tech)&hl=en-US&gl=US&ceid=US:en" },
  { name: "Reuters", url: "https://news.google.com/rss/search?q=when:24h+site:reuters.com+(AI+OR+Artificial+Intelligence+OR+Algorithm)&hl=en-US&gl=US&ceid=US:en" },
  { name: "FT", url: "https://news.google.com/rss/search?q=when:24h+site:ft.com+(Tech+OR+IT+OR+Software)&hl=en-US&gl=US&ceid=US:en" },
  { name: "NYT Tech", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware 및 정적 파일 서빙 설정 (중요: 장애 해결 핵심)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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

// 원본 뉴스 제목에서 불필요한 꼬리표(매체명 등)를 안전하게 정제하는 함수
function cleanExtractedTitle(title) {
  if (!title) return '';
  // 1. 특정 패턴 (예: " < 모빌리티 < 기사본문 - 로봇신문") 꼬리 자르기
  let cleaned = title.replace(/\s*<[^<]+<\s*기사본문\s*-\s*[가-힣]+/, '');
  // 2. 마지막에 위치한 " - 매체명" 또는 " | 매체명" 제거
  let pattern = /\s*[-|]\s*([^-|]+)$/;
  let replacer = (match, p1) => {
    if (/(신문|일보|경제|뉴스|미디어|데일리|통신|타임즈|기자|Korea|Herald|닷컴|투데이|ZDNet|블로터|테크|Tech|지디넷|이데일리|뉴시스|머니투데이|OSEN|디스패치|인벤|루리웹|포모스|The Miilk|더밀크)/i.test(p1)) {
      return '';
    }
    if (p1.length <= 6 && !p1.includes(' ')) {
      return '';
    }
    return match;
  };

  cleaned = cleaned.replace(pattern, replacer);
  // 만약 꼬리가 여러개 붙어있는 경우 (- 더밀크 | The Miilk 처럼) 한 번 더 실행
  cleaned = cleaned.replace(pattern, replacer);

  return cleaned.trim();
}

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
    뉴스 내용을 분석하여 핵심 요약을 작성하되, **반드시 4개의 문장**으로 구성하라.
    각 문장 사이에는 줄바꿈(\\n)을 넣어라.
    **가장 중요한 규칙**: 각 문장의 끝은 반드시 ~함, ~임 대신에 **"~입니다", "~했습니다"**와 같은 **자연스러운 평어체**로 종결하라.
    문장 앞에 숫자(1.)나 기호(-, •)를 절대 넣지 마라.`;

    const userPrompt = `
    다음 뉴스 본문을 분석해서 아래 형식의 순수 JSON으로만 응답해줘. 
    
    {
      ${isEnglish ? '"title": "한국어 번역 제목",\n      ' : ''}"category": "AI, Robot, Security, Data, Display, IT, 기타 중 하나 선택",
      "summary": [
        "첫 번째 문장 (~입니다 체)",
        "두 번째 문장 (~입니다 체)",
        "세 번째 문장 (~입니다 체)",
        "네 번째 문장 (~입니다 체)"
      ],
      "published_at": "${publishedAt || new Date().toISOString().split('T')[0]}"
    }
    
    주의사항:
    ${isEnglish ? '- title: 원본 영어 제목을 반드시 한국어로 번역하세요.\n    ' : ''}- category: [AI, Robot, Security, Data, Display, IT, 기타] 중 하나 선택.
    - summary: 기사 본문에 나오는 구체적인 수치, 고유명사, 핵심 결과 및 의미 등을 풍부하게 포함하여 **정확히 4개의 상세한 문장**으로 요약하세요. 단순하고 뻔한 요약 대신 구체적인 팩트를 전달해야 합니다.
    - 모든 문장의 끝은 반드시 **"~입니다", "~했습니다"**와 같은 자연스러운 평어체로 종결해야 합니다. 명사형 종결은 절대 금지합니다.
    - 기사 발행일 힌트: "${publishedAt || '날짜 정보 없음'}" 를 참고하세요.

    원본 기사 제목: ${title}
    기사 발행일 힌트: ${publishedAt || '날짜 정보 없음'}

    뉴스 본문:
    ${bodyText}
    `;

    console.log(`[Ollama] Requesting summary from ${MODEL}... (Timeout: 90s)`);
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: MODEL,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 1500 // 불필요한 수다 방지를 위해 출력 길이 제한 (충분히 늘림)
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

    // [구조적 정제] 배열로 받은 요약문을 핀셋 정제 (1~4번 번호만 제거)
    let sumLines = Array.isArray(summaryRaw) ? summaryRaw : String(summaryRaw).split('\n');
    
    // 카테고리 필드 정제 로직 복구
    const validCategories = ['AI', 'Robot', 'Security', 'Data', 'Display', 'IT', '기타'];
    let finalCategory = aiData.category || '기타';
    if (!validCategories.includes(finalCategory)) {
      finalCategory = validCategories.find(c => finalCategory.toUpperCase().includes(c.toUpperCase())) || '기타';
    }

    const cleanSummary = sumLines
      .map(line => line
        .replace(/^([1-4]\.[\s]*)?[\s\-*•·]+/g, '') // 불렛 및 1~4번 번호만 선택적 제거
        .replace(/^(첫|두|세|네)\s*번째?\s*핵심\s*요약[:\s]*/g, '')
        .trim()
      )
      .filter(l => l.length > 5)
      .slice(0, 4)
      .join('\n');

    let finalTitle = isEnglish ? (aiData.title || title) : cleanExtractedTitle(title);

    return {
      title: finalTitle,
      category: finalCategory,
      summary: cleanSummary,
      published_at: aiData.published_at || new Date().toISOString().split('T')[0],
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
      ${isEnglish ? '"title": "기사 제목의 한국어 번역",\n      ' : ''}"category": "AI, Robot, Security, Data, Display, IT, 기타 중 하나를 가장 적절한 것으로 선택",
      "summary": [
        "첫 번째 구체적이고 상세한 핵심 요약 문장 (~입니다 체)",
        "두 번째 구체적이고 상세한 핵심 요약 문장 (~입니다 체)",
        "세 번째 구체적이고 상세한 핵심 요약 문장 (~입니다 체)",
        "네 번째 구체적이고 상세한 핵심 요약 문장 (~입니다 체)"
      ],
      "published_at": "${publishedAt || new Date().toISOString().split('T')[0]}"
    }
    
    원본 기사 제목: ${title}
    기사 발행일 힌트: ${publishedAt || '날짜 정보 없음'}

    뉴스 본문:
    ${bodyText}
    
    주의사항:
    ${isEnglish ? '- title: 원본 영어 제목을 반드시 한국어로 번역하세요.\n    ' : ''}- 요약(summary)은 반드시 숫자를 붙이지 말고 **4개**의 문장을 포함하는 JSON 배열([]) 형식으로 작성하세요. 
    - 요약 문장에는 기사 본문의 구체적인 수치, 고유명사, 성과 및 기대효과 등을 풍부하게 포함하여 정보량이 많고 구체적인 내용으로 작성하세요.
    - 본문이 너무 짧거나 정보가 부족하더라도 절대 거절(예: "요약할 수 없습니다")하지 마세요. 대신 본문의 핵심 문장을 활용하여 어떻게든 4줄의 구체적인 문장(JSON 배열)을 만들어내야 합니다.
    - 어떤 상황에서도 서론이나 설명 등 평문을 덧붙이지 말고, 오직 중괄호 '{' 로 시작하는 순수 JSON 형식으로만 응답하세요.
    - 각 문장의 끝은 반드시 ~함, ~임 대신에 **"~입니다", "~했습니다"**와 같은 **자연스러운 평어체**로 종결하세요.
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
      maxOutputTokens: 2048
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
      
      const validCategories = ['AI', 'Robot', 'Security', 'Data', 'Display', 'IT', '기타'];
      let finalCategory = aiData.category || '기타';
      if (!validCategories.includes(finalCategory)) {
        finalCategory = validCategories.find(c => finalCategory.toUpperCase().includes(c.toUpperCase())) || '기타';
      }

      // [구조적 정제] 1~4번 번호패턴만 핀셋 제거
      let summaryLines = Array.isArray(aiData.summary) ? aiData.summary : (aiData.summary || '').split('\n');
      let cleanSummary = summaryLines
        .map(line => line.replace(/^([1-4]\.[\s]*)?[\s\-*•·]+/g, '').trim())
        .filter(l => l)
        .slice(0, 4)
        .join('\n');

      // 날짜 유효성 검사 (YYYY-MM-DD 형식이 아니면 오늘 날짜 사용)
      let finalDate = aiData.published_at;
      const dateRegex = /^\d{4}-\d{2}-\d{2}/;
      if (!finalDate || !dateRegex.test(finalDate) || finalDate.includes('YYYY')) {
        finalDate = new Date().toISOString().split('T')[0];
      }

      let finalTitle = isEnglish ? (aiData.title || title) : cleanExtractedTitle(title);

      return {
        title: finalTitle,
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
카테고리: <AI, Robot, Security, Data, Display, IT, 기타 중 가장 적절한 하나 선택>
<구체적이고 상세한 핵심 요약 문장 1 (한국어, 수치와 팩트 포함, ~입니다 체)>
<구체적이고 상세한 핵심 요약 문장 2 (한국어, 수치와 팩트 포함, ~입니다 체)>
<구체적이고 상세한 핵심 요약 문장 3 (한국어, 수치와 팩트 포함, ~입니다 체)>
<구체적이고 상세한 핵심 요약 문장 4 (한국어, 수치와 팩트 포함, ~입니다 체)>

주의사항:
- 반드시 '제목:'으로 시작하는 한국어 번역 제목 1줄과 숫자가 없는 **4개**의 핵심 문장으로 작성하세요. 
- 각 문장의 끝은 반드시 ~함, ~임 대신에 **"~입니다", "~했습니다"**와 같은 **자연스러운 평어체**로 종결하세요.
- 마크다운 문법을 절대 사용하지 마세요. 1., 2. 같은 숫자를 붙이지 마세요.

  기사 제목: ${title}
  기사 발행일 힌트: ${publishedAt || '발행일 정보 없음'}
  기사 본문: ${bodyText}`
    : `다음 뉴스 기사를 읽고 아래 형식에 정확히 맞춰 4줄의 핵심 요약으로 한국어로 요약해 주세요.
  형식:
  <핵심 요약 문장 (정확히 4개, ~입니다 체)>
  카테고리: <AI, Robot, Security, Data, Display, IT, 기타 중 하나 선택>
  
  주의사항:
  - 반드시 각 문장 뒤에 줄바꿈(\\n)을 넣어 **4개**의 별도 문장으로 구성하세요.
  - 각 문장의 끝은 반드시 **"~입니다", "~했습니다"**와 같은 **자연스러운 평어체**로 종결하세요.
  - 요약 문장에는 기사의 구체적인 수치, 고유명사, 연구결과 및 의미 등을 풍부하게 포함하여 상세하게 작성하세요. 단순하고 뻔한 요약은 피해야 합니다.
  - 1., 2. 같은 숫자나 불렛 기호(-, *)를 절대 붙이지 마세요.
  - 서론과 결론 없이 오직 4줄의 상세한 요약 내용만 출력하세요.
 
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
      // [구조적 정제] 1~4번 번호패턴만 핀셋 제거하여 연도/소수점 보호
      const sentences = line.split(/(?<=\.)\s+/);
      for (const sent of sentences) {
        const cleanSent = sent.replace(/^([1-4]\.[\s]*)?[\s\-*•·]+/g, '').trim();
        if (cleanSent) finalLines.push(cleanSent);
      }
    }
  }

  // 최종 요약문 구성 (최대 4줄 보장)
  const summaryLines = finalLines.slice(0, 4);

  if (summaryLines.length > 0) {
    let finalTitleToUse = isEnglish ? finalTitle : cleanExtractedTitle(title);

    return {
      title: finalTitleToUse,
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
 
// [신규 API] 이미지 프록시 (Hotlinking 차단 우회용 - Base64 지원)
app.get('/api/proxy-image', async (req, res) => {
  let imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Image URL is required');

  try {
    // Hex(16진수) 인코딩 인지 확인 (http로 시작하지 않고 0-9, a-f로만 구성됨)
    if (!imageUrl.startsWith('http')) {
      try {
        // Hex 디코딩 시도
        imageUrl = Buffer.from(imageUrl, 'hex').toString('utf8');
        console.log(`[Proxy] Successfully decoded Hex URL: ${imageUrl}`);
      } catch (e) {
        console.error('[Proxy] Hex decoding failed:', e.message);
        return res.status(400).send('Invalid encoded URL');
      }
    }

    // 최종 주소 검증
    if (!imageUrl.startsWith('http')) {
      return res.status(400).send('Absolute URL is required');
    }

    const referer = imageUrl.includes('nate.com') ? 'https://news.nate.com/' : 'https://www.google.com/';
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      }
    });

    let imageBuffer = Buffer.from(response.data);

    if (req.query.round === 'true') {
      imageBuffer = await sharp(imageBuffer)
        .resize(400, 400, { fit: 'cover' })
        .composite([
          {
            input: Buffer.from(
              `<svg><rect x="0" y="0" width="400" height="400" rx="30" ry="30" fill="#fff" /></svg>`
            ),
            blend: 'dest-in'
          }
        ])
        .png()
        .toBuffer();
      res.setHeader('Content-Type', 'image/png');
    } else {
      res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    }

    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1일 캐싱
    res.send(imageBuffer);
  } catch (error) {
    console.error(`[Proxy] Image fetch failed for URL [${imageUrl}]:`, error.message);
    res.status(500).send('Failed to proxy image');
  }
});

app.post('/api/extract', async (req, res) => {

  const { url: rawUrl } = req.body;
  if (!rawUrl) return res.status(400).json({ success: false, error: 'URL is required' });

  const url = normalizeUrl(rawUrl);

  try {
    // [중복 체크] 이미 등록된 뉴스라면 추출 과정 생략 (성능 및 비용 최적화)
    if (USE_LOCAL_DB) {
      const existing = localDb.prepare(`SELECT id FROM "${TABLE_NAME}" WHERE url = ?`).get(url);
      if (existing) return res.status(400).json({ success: false, error: '이미 등록된 뉴스입니다.' });
    } else {
      const { data: existing } = await supabase.from(TABLE_NAME).select('id').eq('url', url).maybeSingle();
      if (existing) return res.status(400).json({ success: false, error: '이미 등록된 뉴스입니다.' });
    }
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

    // [Step 0] 구글 뉴스 리다이렉트 URL 사전 처리 (진짜 주소 찾기)
    if (url.includes('news.google.com/rss/articles/')) {
      try {
        const splashRes = await axios.get(url, { headers, timeout: 5000 });
        const $splash = cheerio.load(splashRes.data);
        const resolved = $splash('link[rel="canonical"]').attr('href') || 
                         $splash('meta[property="og:url"]').attr('content') ||
                         splashRes.data.match(/data-n-au="([^"]+)"/)?.[1];
        if (resolved && !resolved.includes('news.google.com')) {
          url = resolved;
          console.log(`[Crawler] Successfully resolved Google News redirect: ${url}`);
        }
      } catch (e) {
        console.warn('[Crawler] Google News resolve failed, using original:', e.message);
      }
    }

    const response = await axios.get(url, { 
      headers, 
      timeout: 15000, 
      responseType: 'arraybuffer', // 인코딩 처리를 위해 raw 버퍼로 받습니다.
      validateStatus: (status) => status < 500 
    });
    
    const buffer = response.data;
    const status = response.status;
    
    // [인코딩 감지 및 변환]
    let charset = 'utf-8';
    
    // 1. 헤더에서 감지
    const contentType = response.headers['content-type'] || '';
    const headerMatch = contentType.match(/charset=([\w\-]+)/i);
    if (headerMatch) {
      charset = headerMatch[1].toLowerCase();
    } else {
      // 2. jschardet으로 내용물 분석
      const detected = jschardet.detect(buffer);
      if (detected && detected.confidence > 0.8) {
        charset = detected.encoding.toLowerCase();
      }
    }

    // 네이트 등 특수 인코딩 처리
    let html = iconv.decode(buffer, charset);
    
    // 만약 깨짐이 남아있다면 meta 태그 분석 후 재디코딩 시도
    let $ = cheerio.load(html);
    const metaCharset = $('meta[charset]').attr('charset') || 
                        $('meta[http-equiv="Content-Type"]').attr('content')?.match(/charset=([\w\-]+)/i)?.[1];
    
    if (metaCharset && metaCharset.toLowerCase() !== charset) {
      charset = metaCharset.toLowerCase();
      html = iconv.decode(buffer, charset);
      $ = cheerio.load(html);
    }

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

    let title = $('meta[property="og:title"]').attr('content') || 
                $('.articleSubecjt').text().trim() || // Nate 전용 (오타 포함)
                $('h1.articleSubecjt').text().trim() ||
                $('title').text().trim() || 
                "제목 없음";

    
    // [제목 세척 고도화] 매체명 접미사 제거 ( - , | , : , / 등 및 특정 매체명 직접 제거)
    title = title.replace(/\s*[-|:|/]\s*(더밀크\s*\|\s*The\s*Miilk|더밀크|Bloomberg\.com|Bloomberg|CNBC|The Verge|NYT|Reuters|Financial Times|FT|TechCrunch|VentureBeat|CNET|Wired).*$/i, '').trim();
    
    // Fallback: 위 정규식으로 안 잡히는 일반적인 구분자 처리
    if (title.includes(' - ')) title = title.split(' - ').slice(0, -1).join(' - ');
    else if (title.includes(' | ')) title = title.split(' | ').slice(0, -1).join(' | ');
    else if (title.includes(' : ')) title = title.split(' : ').slice(0, -1).join(' : ');
    
    title = title.trim();
    
    let imageUrl = "";
    
    // 네이트 뉴스의 경우 메타 태그(og:image)가 저화질이거나 작동하지 않는 경우가 많아 본문 이미지 우선 탐색
    if (url.includes('nate.com')) {
      imageUrl = $('#realArtcContents img').first().attr('src') || 
                 $('.img_area img').first().attr('src') || 
                 $('meta[property="og:image"]').attr('content') || "";
    } else {
      imageUrl = $('meta[property="og:image"]').attr('content') || 
                 $('#realArtcContents img').first().attr('src') || 
                 $('.img_area img').first().attr('src') || 
                 $('article img').first().attr('src') || "";
    }

    // [이미지 추출 고도화] 여전히 비어있거나 불량인 경우 fallback
    if (!imageUrl || imageUrl.includes('blank.gif') || imageUrl.includes('default_image')) {
      imageUrl = $('article img').first().attr('src') || imageUrl;
    }

    // [이미지 주소 정제] 네이트 등에서 발생하는 /// 및 상대 경로 처리
    if (imageUrl) {
      imageUrl = imageUrl.trim();
      
      // 상대 경로 해결
      if (imageUrl.startsWith('/')) {
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else {
          // 절대 경로가 아닌 경우 현재 URL의 도메인 결합
          try {
            const urlObj = new URL(url);
            imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
          } catch (e) {
            console.error('[Crawler] Failed to resolve relative image URL:', e.message);
          }
        }
      }

      // 네이트 특유의 중복 슬래시 해결
      // 1. 프로토콜 부분은 그대로 두고 나머지의 중복 슬래시를 합침
      if (imageUrl.startsWith('https://')) {
        imageUrl = 'https://' + imageUrl.substring(8).replace(/\/+/g, '/');
      } else if (imageUrl.startsWith('http://')) {
        imageUrl = 'http://' + imageUrl.substring(7).replace(/\/+/g, '/');
      } else {
        // 프로토콜이 없는 경우 등
        imageUrl = imageUrl.replace(/\/+/g, '/');
        if (imageUrl.startsWith('https:/')) imageUrl = imageUrl.replace('https:/', 'https://');
        else if (imageUrl.startsWith('http:/')) imageUrl = imageUrl.replace('http:/', 'http://');
      }
    }
    
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
      '#realArtcContents', '#articleContetns', // Nate 전용 (오타 포함)
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
    // [AI 요약 연동] 환경별 분기 (로컬: Qwen 단독, AWS: Gemini -> Claude)
    let geminiErrorMsg = "";
    let ollamaErrorMsg = "";
    let claudeErrorMsg = "";
    let engine = "";

    if (USE_LOCAL_DB) {
      // 로컬 환경: Ollama (Qwen)만 사용
      try {
        console.log('[AI] Attempting Local Ollama (Qwen)...');
        const liteBodyText = bodyText.slice(0, 4000);
        const ollamaResult = await summarizeWithOllama(liteBodyText, title, publishedAt);
        extractedData = { ...extractedData, ...ollamaResult };
        engine = ollamaResult.engine;
      } catch (ollamaErr) {
        console.error('[AI] Local AI failed:', ollamaErr.message);
        ollamaErrorMsg = ollamaErr.message;
        extractedData.summary = `⚠️ 로컬 AI(Qwen) 요약 중 오류가 발생했습니다.\n상세: ${ollamaErrorMsg}`;
        engine = "Error";
      }
    } else {
      // AWS 환경: Gemini -> Claude
      try {
        console.log('[AI] Attempting Gemini for Text Summary...');
        const geminiResult = await summarizeWithGemini(bodyText, title, publishedAt);
        extractedData = { ...extractedData, ...geminiResult };
        engine = "Gemini";
      } catch (geminiError) {
        console.warn('Gemini Failed, switching to Claude fallback:', geminiError.message);
        geminiErrorMsg = geminiError.message;
        
        try {
          console.log('[AI] Attempting Claude for Text Summary...');
          const claudeResult = await summarizeWithClaude(bodyText, title, publishedAt);
          extractedData = { ...extractedData, ...claudeResult };
          engine = "Claude";
        } catch (claudeError) {
          console.error('All AI engines failed:', claudeError.message);
          claudeErrorMsg = claudeError.message;
          extractedData.summary = `⚠️ AI 요약 시스템 긴급 점검 중\n- Gemini: ${geminiErrorMsg}\n- Claude: ${claudeErrorMsg}`;
          engine = "Error";
        }
      }
    }

    // 진단 정보 추가 (AWS 환경에서 Claude로 폴백된 경우)
    if (!USE_LOCAL_DB && engine === "Claude" && geminiErrorMsg) {
      extractedData.summary += `\n\n[Diagnosis: Gemini(${geminiErrorMsg.slice(0, 150)})]`;
    }

    res.json({ 
      success: true, 
      ...extractedData,
      engine,
      image: imageUrl, // 프론트엔드에서 프록시 처리를 하므로 여기서는 순수 URL만 반환
      url: url 
    });

  } catch (error) {
    console.error('Extraction engine error:', error);
    // 에러 발생 시에도 추출된 제목이 있다면 프론트엔드 수동 입력을 위해 전달합니다.
    res.status(200).json({ 
      success: false, 
      error: error.message,
      title: typeof title !== 'undefined' ? title : "" 
    });
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
      if (USE_LOCAL_DB) {
        console.log('[API] Attempting Local Ollama for Text Summary...');
        result = await summarizeWithOllama(text, targetTitle);
        engine = result.engine;
      } else {
        try {
          console.log('[API] Attempting Gemini for Text Summary...');
          result = await summarizeWithGemini(text, targetTitle);
          engine = "Gemini";
        } catch (geminiError) {
          console.warn('[API] Gemini failed, trying Claude:', geminiError.message);
          result = await summarizeWithClaude(text, targetTitle);
          engine = "Claude";
        }
      }
    } catch (err) {
      throw new Error(`AI 요약 중 오류가 발생했습니다: ${err.message}`);
    }
    
    res.json({ success: true, ...result, engine });
  } catch (error) {
    console.error('[API] Text summarization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PPT 발행용 요약 헬퍼 함수
async function summarizeForPublish(title, summary) {
  const isKorean = /[가-힣]/.test(title);
  if (!isKorean) {
    // 한글이 아니면 기본 25자 자르기 및 2줄 슬라이싱 처리
    return {
      title_ko: title.length > 25 ? title.substring(0, 25) : title,
      summary_eng: summary.split('\n').slice(0, 2).join('\n')
    };
  }

  const prompt = `
  당신은 뉴스 요약 전문가입니다.
  주어진 한국어 뉴스 카드 정보를 바탕으로 PPT 슬라이드에 들어갈 핵심 요약본을 작성해야 합니다.
  
  [핵심 제약 조건 - 절대 엄수]
  1. 글자 수 제한:
     - "title_ko": 공백 포함 **25자 이상 30자 이내**로 요약된 직관적인 제목.
     - "summary_ko": 공백 포함 **각 문장당 반드시 55자 이상 60자 이내**의 요약 문장 2개를 담은 배열. (공백 포함 60자 절대 초과 금지)
  2. 말투 및 형식:
     - 모든 요약 문장은 **명사 및 명사형(ex: 출시, 제공, 활용, 성공 등)** 혹은 **'~했음', '~있음', '~기록함' 같은 음/기 종결 형태**로 끝마치세요.
     - "~입니다", "~했습니다" 같은 구어체 종결어미는 **절대 사용하지 마세요.**
  3. 출력 형식:
     - 오직 아래 구조의 순수 JSON 데이터만 출력하세요. 다른 텍스트나 \`\`\`json 마크다운은 절대 금지합니다.

  [작성 예시 - 공백 포함 55자~60자 사이를 정확히 맞춘 모범 작성 예시]
  {
    "title_ko": "지멘스와 영국 휴머노이드사의 에를랑엔 공장 로봇 테스트 완료",
    "summary_ko": [
      "독일 지멘스가 영국 휴머노이드사와 긴밀하게 협력하여 공장 내 물류 자동화를 위한 바퀴형 로봇 주행 테스트 성공",
      "인공지능 인프라와 첨단 디지털 시뮬레이션 도구를 적극 활용하여 실제 공장 환경에서의 자율 주행 성능 최적화"
    ]
  }

  [제약 조건 엄수 요청]
  - 문장 길이는 반드시 공백 포함 **55자~60자** 사이로 꽉 채워 작성하여 PPT 상에서 정확하고 예쁜 2줄로 떨어지도록 유도하세요.
  - **단 1글자도 공백 포함 60자를 절대 초과해서는 안 됩니다.**

  - "title_ko": 공백 포함 **반드시 25자 이상 30자 이내**
  - "summary_ko": 공백 포함 **각 문장당 반드시 55자 이상 60자 이내** (절대 엄수)

  원본 제목: ${title}
  원본 요약:
  ${summary}
  `;

  // 1. Ollama 사용 (localhost 모드일 경우 강제)
  if (USE_LOCAL_DB) {
    try {
      const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
      const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
      
      const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: MODEL,
        prompt: prompt,
        stream: false,
        options: { temperature: 0.1 }
      }, { timeout: 30000 });

      let rawResponse = response.data.response;
      console.log('[AI] Ollama raw response:', rawResponse);
      let startIdx = rawResponse.indexOf('{');
      let endIdx = rawResponse.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        let jsonStr = rawResponse.substring(startIdx, endIdx + 1);
        let data = JSON.parse(jsonStr);
        
        let finalTitle = data.title_ko || data.title || title;
        let finalSummary = data.summary_ko || data.summary_eng || data.summary;

        // [제목 25~30자 맞춤용 패딩 로직]
        if (finalTitle.length < 25) {
          const paddings = [
            '에 따른 향후 발전 방향과 전망',
            '에 대한 세부 성과와 기대 효과',
            '에 따른 물류 혁신 및 발전 기대',
            '에 관한 심층적인 분석과 전망',
            '에 대한 적극적인 추진 계획',
            '에 따른 성과 분석과 전망',
            '을 통한 비즈니스 가치 창출',
            '에 따른 혁신적인 성과 기대'
          ];
          for (const pad of paddings) {
            let candidate = finalTitle + pad;
            if (candidate.length >= 25 && candidate.length <= 30) {
              finalTitle = candidate;
              break;
            }
          }
          // 만약 조합으로도 25~30자가 안 만들어지면, 그냥 원본 제목을 30자로 자르거나 억지 패딩을 자름
          if (finalTitle.length < 25) {
            finalTitle = (finalTitle + '에 대한 세부 성과와 향후 전망 기대').substring(0, 30);
          }
        } else if (finalTitle.length > 30) {
          finalTitle = finalTitle.substring(0, 30);
        }

        let processedSummary = '';
        if (Array.isArray(finalSummary)) {
          processedSummary = finalSummary
            .slice(0, 2)
            .join('\n');
        } else {
          processedSummary = (finalSummary || summary)
            .split('\n')
            .slice(0, 2)
            .join('\n');
        }

        return {
          title_ko: finalTitle,
          summary_eng: processedSummary,
          engine: "Ollama"
        };
      }
    } catch (ollamaErr) {
      console.warn('[AI] Local Ollama failed for publish:', ollamaErr.message);
      console.error(ollamaErr);
    }

    // 최악의 경우 Fallback (단순 슬라이싱)
    return {
      title_ko: title.length > 30 ? title.substring(0, 30) : title,
      summary_eng: summary.split('\n').slice(0, 2).map(line => line.length > 60 ? line.substring(0, 60) : line).join('\n'),
      engine: "Fallback"
    };
  }

  // 2. Gemini API 사용 (Fallback 또는 클라우드 배포 모드)
  try {
    const API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.1, 
        maxOutputTokens: 1024,
        response_mime_type: "application/json"
      }
    };

    const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    
    if (response.data.candidates && response.data.candidates.length > 0) {
      const responseText = response.data.candidates[0].content.parts[0].text.trim();
      let startIdx = responseText.indexOf('{');
      let endIdx = responseText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        let jsonStr = responseText.substring(startIdx, endIdx + 1);
        let data = JSON.parse(jsonStr);
        return {
          title_ko: data.title_ko || (title.length > 25 ? title.substring(0, 25) : title),
          summary_eng: Array.isArray(data.summary_ko) ? data.summary_ko.join('\n') : (data.summary_eng || summary.split('\n').slice(0, 2).join('\n')),
          engine: "Gemini"
        };
      }
    }
  } catch (geminiErr) {
    console.warn('[AI] Gemini failed for publish, trying Claude fallback:', geminiErr.message);
  }

  // 3. Gemini 실패 시 Claude API 시도
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "당신은 뉴스 요약 전문가입니다. JSON 출력만 허용합니다.",
      messages: [{ role: "user", content: prompt }],
    });

    let responseText = msg.content[0].text.trim();
    let startIdx = responseText.indexOf('{');
    let endIdx = responseText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      let jsonStr = responseText.substring(startIdx, endIdx + 1);
      let data = JSON.parse(jsonStr);
      return {
        title_ko: data.title_ko || (title.length > 25 ? title.substring(0, 25) : title),
        summary_eng: Array.isArray(data.summary_ko) ? data.summary_ko.join('\n') : (data.summary_eng || summary.split('\n').slice(0, 2).join('\n')),
        engine: "Claude"
      };
    }
  } catch (claudeErr) {
    console.error('[AI] Claude failed for publish:', claudeErr.message);
  }

  // 최악의 경우 Fallback (단순 슬라이싱)
  return {
    title_ko: title.length > 30 ? title.substring(0, 30) : title,
    summary_eng: summary.split('\n').slice(0, 2).map(line => line.length > 60 ? line.substring(0, 60) : line).join('\n'),
    engine: "Fallback"
  };
}

// [신규 API] 뉴스 카드 PPT용 요약 및 DB 발행
app.post('/api/publish-news', async (req, res) => {
  const { newsList } = req.body;
  if (!newsList || !Array.isArray(newsList)) {
    return res.status(400).json({ success: false, error: '뉴스 목록이 필요합니다.' });
  }

  try {
    const publishedData = [];

    for (const item of newsList) {
      let targetTitle = item.title;
      let targetSummary = item.summary;

      // 0. DB 조회 (ai-bongchae-dev의 news 테이블)
      if (USE_LOCAL_DB) {
        try {
          const row = localDb.prepare(`SELECT title, summary FROM "${TABLE_NAME}" WHERE url = ?`).get(normalizeUrl(item.url));
          if (row) {
            targetTitle = row.title;
            targetSummary = row.summary;
          }
        } catch (dbErr) {
          console.warn('[API] news DB lookup failed:', dbErr.message);
        }
      }

      // 0.5 ai_news_publish 테이블에 이미 해당 URL 요약본이 있는지 확인
      let existingPublish = null;
      if (USE_LOCAL_DB) {
        try {
          existingPublish = localDb.prepare(`SELECT title_ko, summary_ko FROM "ai_news_publish" WHERE url = ?`).get(normalizeUrl(item.url));
        } catch (dbErr) {
          console.warn('[API] ai_news_publish lookup failed:', dbErr.message);
        }
      } else {
        try {
          const { data, error } = await supabase
            .from('ai_news_publish')
            .select('title_ko, summary_ko')
            .eq('url', normalizeUrl(item.url))
            .maybeSingle();
          if (!error && data) {
            existingPublish = data;
          }
        } catch (supaErr) {
          console.warn('[API] Supabase ai_news_publish lookup failed:', supaErr.message);
        }
      }

      let finalTitleKo = '';
      let finalSummaryKo = '';

      if (existingPublish && existingPublish.title_ko && existingPublish.summary_ko) {
        // 이미 요약본이 존재하면 AI 요약을 건너뜀
        finalTitleKo = existingPublish.title_ko;
        finalSummaryKo = existingPublish.summary_ko;
      } else {
        // 없으면 AI 요약 수행
        const summaryResult = await summarizeForPublish(targetTitle, targetSummary);
        finalTitleKo = summaryResult.title_ko;
        finalSummaryKo = summaryResult.summary_eng;

        const publishPayload = {
          url: normalizeUrl(item.url),
          title_ko: finalTitleKo,
          summary_ko: finalSummaryKo,
          summary_eng: null,
          engine: summaryResult.engine || "Fallback"
        };

        // DB 저장
        if (USE_LOCAL_DB) {
          const stmt = localDb.prepare(`
            INSERT INTO "ai_news_publish" (url, title_ko, summary_ko, summary_eng, engine)
            VALUES (?, ?, ?, ?, ?)
          `);
          stmt.run(publishPayload.url, publishPayload.title_ko, publishPayload.summary_ko, publishPayload.summary_eng, publishPayload.engine);
        } else {
          const { error } = await supabase
            .from('ai_news_publish')
            .insert([publishPayload]);
          if (error) {
            console.error('[Supabase Publish Error]:', error.message);
          }
        }
      }

      publishedData.push({
        ...item,
        title_ko: finalTitleKo,
        summary_ko: finalSummaryKo
      });
    }

    res.json({ success: true, data: publishedData });
  } catch (error) {
    console.error('[API] Publish News Error:', error.message);
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
  const newsData = { ...req.body };
  newsData.url = normalizeUrl(newsData.url);
  try {
    if (USE_LOCAL_DB) {
      // 1. 중복 체크 (UNIQUE 제약 조건 위반 방지)
      const existing = localDb.prepare(`SELECT id FROM "${TABLE_NAME}" WHERE url = ?`).get(newsData.url);
      if (existing) {
        return res.status(400).json({ success: false, error: '이미 등록된 뉴스입니다.' });
      }

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
      // Supabase 모드에서도 중복 체크 수행
      const { data: existingNews } = await supabase
        .from(TABLE_NAME)
        .select('id')
        .eq('url', newsData.url)
        .maybeSingle();

      if (existingNews) {
        return res.status(400).json({ success: false, error: '이미 등록된 뉴스입니다.' });
      }

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

// [기능 변경] 좋아요 토글 Proxy (POST 방식으로 변경하여 보안망 호환성 확보)
app.post('/api/news/:id/like', async (req, res) => {
  const { id } = req.params;
  const { currentStatus } = req.body;
  
  console.log(`[Like Request] News ID: ${id}, Current Status: ${currentStatus}`);
  
  try {
    if (USE_LOCAL_DB) {
      localDb.prepare(`UPDATE "${TABLE_NAME}" SET likes = ? WHERE id = ?`).run(currentStatus ? 0 : 1, id);
      const updated = localDb.prepare(`SELECT * FROM "${TABLE_NAME}" WHERE id = ?`).get(id);
      console.log(`  ✅ Like Success (SQLite): ID ${id}`);
      return res.json({ success: true, data: [{ ...updated, likes: !!updated.likes }] });
    } else {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({ likes: !currentStatus })
        .eq('id', id)
        .select();
      
      if (error) {
        console.error('  ❌ Supabase Like Error:', error);
        throw error;
      }
      
      console.log(`  ✅ Like Success (Supabase): ID ${id}`);
      res.json({ success: true, data });
    }
  } catch (error) {
    console.error(`  ❌ Like Toggle Error (ID ${id}):`, error.message);
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
        title: cleanExtractedTitle(item.title),
        link: link,
        pubDate: item.pubDate || item['dc:date'] || item.isoDate || feed.lastBuildDate || new Date().toISOString(),
        summary: item.contentSnippet || item.description || "",
        originalUrl
      };
    });

    // DB 중복 체크
    const urls = items.map(it => normalizeUrl(it.link));
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

// [API] 뉴스 카드 정보 수정 (제목, 요약)
app.put('/api/news/:id', async (req, res) => {
  const { id } = req.params;
  const { title, summary } = req.body;

  console.log(`\n[Update Request] News ID: ${id}`);
  console.log(`- New Title: ${title?.substring(0, 30)}...`);
  console.log(`- Summary Length: ${summary?.length} chars`);

  if (!title || !summary) {
    console.error('  ❌ Validation Failed: Title or Summary missing');
    return res.status(400).json({ success: false, error: '제목과 요약은 필수입니다.' });
  }

  try {
    if (USE_LOCAL_DB) {
      // 로컬 SQLite 업데이트 (ID를 안전하게 숫자로 변환)
      const numericId = parseInt(id, 10);
      const statement = localDb.prepare(`
        UPDATE "${TABLE_NAME}" 
        SET title = ?, summary = ? 
        WHERE id = ?
      `);
      const info = statement.run(title, summary, numericId);
      
      if (info.changes === 0) {
        console.error(`  ❌ Update Failed: No news found with ID ${id}`);
        return res.status(404).json({ success: false, error: '해당 뉴스를 찾을 수 없습니다.' });
      }
      
      console.log(`  ✅ Update Success (SQLite): ID ${id}`);
      res.json({ success: true, message: '뉴스가 성공적으로 수정되었습니다.' });
    } else {
      // Supabase 업데이트
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({ title, summary })
        .eq('id', id);

      if (error) {
        console.error('  ❌ Supabase Error:', error);
        throw error;
      }
      
      console.log(`  ✅ Update Success (Supabase): ID ${id}`);
      res.json({ success: true, data });
    }
  } catch (error) {
    console.error(`  ❌ Global Update Error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/test-email', async (req, res) => {
  try {
    const accounts = [];
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`RESEND_ACCOUNT_${i}_KEY`];
      if (key) {
        accounts.push({
          key: key,
          to: process.env[`RESEND_ACCOUNT_${i}_TO`] || 'srtechinsight@gmail.com'
        });
      }
    }

    if (accounts.length === 0) {
      const rawTo = process.env.RESEND_TO || 'srtechinsight@gmail.com';
      accounts.push({
        key: process.env.RESEND_API_KEY,
        to: rawTo.includes(',') ? rawTo.split(',').map(e => e.trim()) : rawTo
      });
    }

    const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
    const now = new Date();
    const subject = `[AI Bongchae] 발송 테스트 (${now.toLocaleDateString()} ${now.toLocaleTimeString()})`;

    const results = [];
    
    await Promise.all(accounts.map(async (account) => {
      try {
        if (!account.key) {
           results.push({ to: account.to, success: false, error: 'API Key가 없습니다.' });
           return;
        }

        const resendInstance = new Resend(account.key);
        const sendResult = await resendInstance.emails.send({
          from: from,
          to: account.to,
          subject: subject,
          html: '<p>이메일 발송 기능 연동 테스트입니다. 이미지 없이 본문 텍스트만 정상적으로 발송되었습니다.</p>'
        });

        if (sendResult.error) {
          results.push({ to: account.to, success: false, error: sendResult.error });
        } else {
          results.push({ to: account.to, success: true, id: sendResult.data.id });
        }
      } catch (innerErr) {
        results.push({ to: account.to, success: false, error: innerErr.message });
      }
    }));

    const successCount = results.filter(r => r.success).length;

    res.json({ 
      success: true, 
      total: accounts.length,
      successCount: successCount,
      message: `테스트 발송 결과: 총 ${accounts.length}명 중 ${successCount}명 성공`,
      results 
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-email', async (req, res) => {
  const { newsList, images } = req.body; 
  
  // [AWS 정밀 진단] 요청 수신 로그 및 서버 자원 상태 기록
  const bodySize = JSON.stringify(req.body).length;
  const bodySizeMb = (bodySize / (1024 * 1024)).toFixed(2);
  const memUsage = process.memoryUsage();
  console.log('----------------------------------------------------');
  console.log(`[Email Request Received] ${new Date().toLocaleString()}`);
  console.log(`- News Cards: ${newsList?.length || 0}개`);
  console.log(`- Total Payload Size: ${bodySizeMb} MB`);
  console.log(`- Server RSA Memory: ${(memUsage.rss / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- Server Heap Used: ${(memUsage.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log('----------------------------------------------------');

  if (bodySizeMb > 45) {
    console.warn('⚠️ Payload size is near limit (50MB). This might cause issue on AWS.');
  }

  if (!newsList || !images || newsList.length !== images.length) {
    console.error('[Email Error] Data validation failed');
    return res.status(400).json({ success: false, error: '뉴스 목록과 이미지 데이터가 일치하지 않습니다.' });
  }

  try {
    // [멀티 계정 수집] 중간에 번호가 비어 있어도 최대 10번까지 확인
    const accounts = [];
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`RESEND_ACCOUNT_${i}_KEY`];
      if (key) {
        accounts.push({
          key: key,
          to: process.env[`RESEND_ACCOUNT_${i}_TO`] || 'srtechinsight@gmail.com'
        });
      }
    }

    // 등록된 계정이 없으면 기존 단일 변수 백업 사용
    if (accounts.length === 0) {
      const rawTo = process.env.RESEND_TO || 'srtechinsight@gmail.com';
      accounts.push({
        key: process.env.RESEND_API_KEY,
        to: rawTo.includes(',') ? rawTo.split(',').map(e => e.trim()) : rawTo
      });
    }

    const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
    const now = new Date();
    const subject = `[AI Bongchae] 뉴스 요약 보고서 (${now.toLocaleDateString()} ${now.toLocaleTimeString()})`;

    console.log(`\n[Batch Send Start] Processing ${accounts.length} accounts at ${now.toLocaleString()}`);
    
    const results = [];
    const attachments = [];

    // 공통 첨부파일(이미지) 처리 (모든 계정에 동일하게 사용)
    newsList.forEach((news, idx) => {
      const base64Data = images[idx].split(',')[1];
      attachments.push({
        filename: `slide_${idx}.jpg`,
        content: Buffer.from(base64Data, 'base64'),
        disposition: 'inline',
        contentId: `<slide_${idx}>`
      });
    });

    // 공통 HTML 본문 구성
    let htmlContent = `<div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background: #ffffff; padding: 10px;">`;
    newsList.forEach((news, idx) => {
      htmlContent += `
        <div style="margin-bottom: 20px; text-align: center;">
          <a href="${news.url}" target="_blank" style="display: block; text-decoration: none; border: none;">
            <img src="cid:slide_${idx}" style="width: 100%; max-width: 1000px; display: block; margin: 0 auto; border: none;" alt="${news.title}">
          </a>
        </div>`;
    });
    htmlContent += `</div>`;

    // [핵심] 각 계정별로 병렬 발송 수행 (AWS 타임아웃 방지)
    await Promise.all(accounts.map(async (account) => {
      try {
        console.log(`- Sending to: ${account.to} using API Key: ${account.key ? account.key.substring(0, 10) + '...' : 'MISSING'}`);
        
        if (!account.key) {
           console.error(`  ❌ Skipping ${account.to}: No API Key found.`);
           results.push({ to: account.to, success: false, error: 'API Key가 없습니다.' });
           return;
        }

        const resendInstance = new Resend(account.key);
        const sendResult = await resendInstance.emails.send({
          from: from,
          to: account.to,
          subject: subject,
          html: htmlContent,
          attachments: attachments
        });

        if (sendResult.error) {
          console.error(`  ❌ Failed for ${account.to}:`, sendResult.error);
          results.push({ to: account.to, success: false, error: sendResult.error });
        } else {
          console.log(`  ✅ Success for ${account.to}. ID: ${sendResult.data.id}`);
          results.push({ to: account.to, success: true, id: sendResult.data.id });
        }
      } catch (innerErr) {
        console.error(`  ❌ Exception for ${account.to}:`, innerErr.message);
        results.push({ to: account.to, success: false, error: innerErr.message });
      }
    }));

    const successCount = results.filter(r => r.success).length;
    
    console.log(`[Batch Send End] ${successCount}/${accounts.length} succeeded.\n`);

    res.json({ 
      success: true, 
      total: accounts.length,
      successCount: successCount,
      message: `총 ${accounts.length}명 중 ${successCount}명에게 리포트 발송 성공! ✉️🚀`, 
      results 
    });

  } catch (error) {
    console.error('[Global Email Error] Fatal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log('[Config] Body limit: 50MB');
  console.log('[Config] DB Mode:', USE_LOCAL_DB ? 'Local SQLite' : 'Supabase');
});

// [대용량 처리 보강] 서버 타임아웃을 600초(10분)로 연장하여 초고화질 이미지 전송 중 중단 방지
server.timeout = 600000;
