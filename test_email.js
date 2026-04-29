import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.RESEND_API_KEY;
const toEmail = process.env.RESEND_TO || 'srtechinsight@gmail.com';
const fromEmail = process.env.RESEND_FROM || 'onboarding@resend.dev';

console.log('API Key:', apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING');
console.log('To:', toEmail);
console.log('From:', fromEmail);

if (!apiKey) {
  console.error('Error: RESEND_API_KEY is missing in .env');
  process.exit(1);
}

const resend = new Resend(apiKey);

async function testSend() {
  try {
    console.log('Sending test email...');
    const result = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: '[AI Bongchae] Test Email',
      html: '<p>이메일 발송 기능이 정상 작동하고 있습니다.</p>'
    });

    if (result.error) {
      console.error('Resend Error:', result.error);
    } else {
      console.log('Success! ID:', result.data.id);
    }
  } catch (err) {
    console.error('Fatal Exception:', err.message);
  }
}

testSend();
