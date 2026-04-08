import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  try {
    // API 호환성을 위해 직접 fetch로 모델 목록을 조회해 봅니다.
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.models) {
      console.log("\n✅ 사용 가능한 모델 목록:");
      data.models.forEach(m => {
        if (m.supportedGenerationMethods.includes("generateContent")) {
          console.log(`- ${m.name.replace("models/", "")}`);
        }
      });
    } else {
      console.log("❌ 모델을 찾을 수 없습니다. API 키를 확인해 주세요.", data);
    }
  } catch (error) {
    console.error("❌ 오류 발생:", error.message);
  }
}

listModels();
