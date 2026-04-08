import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testClaudeModels() {
  const modelsToTest = [
    "claude-3-5-sonnet-latest",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-2.1"
  ];

  console.log("🔍 Claude 모델 가용성 테스트 시작...\n");

  for (const model of modelsToTest) {
    try {
      process.stdout.write(`테스트 중: ${model} ... `);
      await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
      console.log("✅ 성공!");
    } catch (error) {
      console.log(`❌ 실패 (${error.status}) - ${error.message.slice(0, 50)}...`);
    }
  }
}

testClaudeModels();
