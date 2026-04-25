import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService implements NestLoggerService {
    private logger: winston.Logger;

    constructor(private configService: ConfigService) {
        const logLevel = this.configService.get<string>('logger.level', 'info');
        const maxFiles = this.configService.get<string>('logger.maxFiles', '14d');
        const maxSize = this.configService.get<string>('logger.maxSize', '20m');
        const dirname = this.configService.get<string>('logger.dirname', 'logs');

        // Formato para desarrollo (legible)
        const devFormat = winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
                const ctx = context ? `[${context}]` : '';
                const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                return `${timestamp} ${level} ${ctx} ${message} ${metaStr}`;
            }),
        );

        // Formato para producción (JSON)
        const prodFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
        );

        const isProduction = process.env.NODE_ENV === 'production';

        this.logger = winston.createLogger({
            level: logLevel,
            format: isProduction ? prodFormat : devFormat,
            transports: [
                // Console transport
                new winston.transports.Console({
                    format: isProduction ? prodFormat : devFormat,
                }),

                // Error log file (solo errores)
                new DailyRotateFile({
                    filename: `${dirname}/error-%DATE%.log`,
                    datePattern: 'YYYY-MM-DD',
                    level: 'error',
                    maxFiles,
                    maxSize,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json(),
                    ),
                }),

                // Combined log file (todos los niveles)
                new DailyRotateFile({
                    filename: `${dirname}/combined-%DATE%.log`,
                    datePattern: 'YYYY-MM-DD',
                    maxFiles,
                    maxSize,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json(),
                    ),
                }),
            ],
        });
    }

    log(message: string, context?: string) {
        this.logger.info(message, { context });
    }

    error(message: string, trace?: string, context?: string) {
        this.logger.error(message, { trace, context });
    }

    warn(message: string, context?: string) {
        this.logger.warn(message, { context });
    }

    debug(message: string, context?: string) {
        this.logger.debug(message, { context });
    }

    verbose(message: string, context?: string) {
        this.logger.verbose(message, { context });
    }
}
