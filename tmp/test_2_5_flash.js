import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function test25Flash() {
  const API_KEY = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [{ text: "안녕? 너는 누구니? 아주 짧게 대답해줘." }]
    }]
  };

  try {
    console.log("--- Testing Gemini 2.5 Flash ---");
    const response = await axios.post(url, payload);
    console.log("Success! Response:");
    console.log(response.data.candidates[0].content.parts[0].text);
  } catch (err) {
    if (err.response) {
      console.error(`Error (${err.response.status}):`, err.response.data.error?.message || 'Unknown');
    } else {
      console.error("Network Error:", err.message);
    }
  }
}

test25Flash();
