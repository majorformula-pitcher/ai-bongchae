import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config();

const db = new Database('bongchae.dev.db');
const TABLE_NAME = process.env.TABLE_NAME || 'ai-bongchae-dev';

console.log('--- ai_news_publish contents ---');
const rows = db.prepare('SELECT id, url, title_ko, summary_ko FROM ai_news_publish ORDER BY id DESC LIMIT 2').all();
console.log(JSON.stringify(rows, null, 2));

console.log('--- ' + TABLE_NAME + ' contents ---');
const rows2 = db.prepare(`SELECT id, url, title, summary FROM "${TABLE_NAME}" ORDER BY id DESC LIMIT 2`).all();
console.log(JSON.stringify(rows2, null, 2));
