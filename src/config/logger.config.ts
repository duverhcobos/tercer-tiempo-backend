import { registerAs } from '@nestjs/config';

export default registerAs('logger', () => ({
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    dirname: process.env.LOG_DIR || 'logs',
}));
