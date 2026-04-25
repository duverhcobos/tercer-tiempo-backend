import { registerAs } from '@nestjs/config';

export default registerAs('throttle', () => ({
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10), // 60 seconds window
    limit: parseInt(process.env.THROTTLE_LIMIT || '10', 10), // max requests per TTL
}));
