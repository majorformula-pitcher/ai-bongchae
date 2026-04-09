import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Work/Test/.env' });

async function diagModels() {
  const API_KEY = process.env.GEMINI_API_KEY;
  console.log('--- Gemini API Diagnostic Start (ESM) ---');
  if (!API_KEY) {
    console.error('Error: GEMINI_API_KEY not found in .env');
    return;
  }
  console.log('API Key (Masked):', API_KEY.substring(0, 10) + '...');
  
  const versions = ['v1', 'v1beta'];
  
  for (const v of versions) {
    console.log(`\n[Checking Version: ${v}]`);
    const url = `https://generativelanguage.googleapis.com/${v}/models?key=${API_KEY}`;
    try {
      const response = await axios.get(url);
      if (response.data && response.data.models) {
        console.log(`Success! Found ${response.data.models.length} models.`);
        const flashModels = response.data.models.filter(m => m.name.toLowerCase().includes('flash'));
        if (flashModels.length > 0) {
          console.log('Available Flash Models:');
          flashModels.forEach(m => console.log(` - ${m.name} (${m.displayName})`));
        } else {
          console.log('No Flash models found in this version.');
          console.log('First 5 models:', response.data.models.slice(0, 5).map(m => m.name).join(', '));
        }
      } else {
        console.log('No models data in response.');
      }
    } catch (error) {
      console.error(`Error in ${v}:`, error.response ? error.response.status : error.message);
      if (error.response) console.error('Response Data:', JSON.stringify(error.response.data));
    }
  }
}

diagModels();
