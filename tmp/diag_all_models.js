import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Work/Test/.env' });

async function diagAllModels() {
  const API_KEY = process.env.GEMINI_API_KEY;
  console.log('--- Scanning All Available Models ---');
  if (!API_KEY) return;
  
  for (const v of ['v1', 'v1beta']) {
    const url = `https://generativelanguage.googleapis.com/${v}/models?key=${API_KEY}`;
    try {
      const resp = await axios.get(url);
      if (resp.data.models) {
        console.log(`\n[${v} Models]`);
        resp.data.models.forEach(m => console.log(`👉 ${m.name}`));
      }
    } catch (e) {
      console.log(`Error ${v}: ${e.message}`);
    }
  }
}

diagAllModels();
