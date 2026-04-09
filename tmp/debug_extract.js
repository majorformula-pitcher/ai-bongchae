import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

const url = 'https://www.newstheai.com/news/articleView.html?idxno=20519';

async function testExtraction() {
  console.log('--- 뉴스 추출 테스트 시작 ---');
  console.log('Target URL:', url);

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ko-KR;q=0.8,ko;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000, validateStatus: (status) => status < 500 });
    const status = response.status;
    const html = response.data;
    const $ = cheerio.load(html);

    console.log('HTTP Status:', status);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    console.log('Extracted Title:', title);

    const bodySelectors = [
      'div.article_txt', 'div.article_body', 'div#articleBody',
      'div#article-view-content-div', 'div.news_cnt_detail_wrap',
      'article', 'main'
    ];

    let bodyText = "";
    for (const selector of bodySelectors) {
      const el = $(selector);
      if (el.length > 0) {
        bodyText = el.text().trim();
        if (bodyText.length > 100) {
          console.log(`Success with selector: ${selector}`);
          break;
        }
      }
    }

    if (bodyText.length < 100) {
      console.log('Standard selectors failed. Trying P tags...');
      const pTexts = [];
      $('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 40) pTexts.push(text);
      });
      bodyText = pTexts.join('\n');
    }

    console.log('--- 추출된 본문 (앞 200자) ---');
    console.log(bodyText.substring(0, 200) + '...');
    console.log('Total Length:', bodyText.length);

  } catch (err) {
    console.error('Test Failed:', err.message);
  }
}

testExtraction();
