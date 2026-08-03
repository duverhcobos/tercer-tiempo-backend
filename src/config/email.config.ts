import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
    resendApiKey: process.env.RESEND_API_KEY!,
    fromEmail: process.env.EMAIL_FROM ?? 'noreply@3tiempo.com',
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
}));