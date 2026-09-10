import dotenv from "dotenv";
dotenv.config();

async function testChain() {
  const models = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash'
  ];

  console.log("\n--- Gemini API 모델 실시간 호출 검증 ---");
  for (const m of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
      });
      const data = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        console.log(`✅ [${m}] 호출 성공!`);
      } else {
        console.log(`❌ [${m}] 응답 오류: ${data.error?.message || JSON.stringify(data)}`);
      }
    } catch(e) {
      console.log(`❌ [${m}] 에러: ${e.message}`);
    }
  }
}

testChain();
