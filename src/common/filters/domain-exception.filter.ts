import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../logger/logger.service';
import { ExceptionHandler } from './handlers/exception-handler.interface';
import { ThrottlerExceptionHandler } from './handlers/throttler-exception.handler';
import { DomainExceptionHandler } from './handlers/domain-exception.handler';
import { HttpExceptionHandler } from './handlers/http-exception.handler';
import { UnknownErrorHandler } from './handlers/unknown-error.handler';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
    private readonly handlers: ExceptionHandler[] = [
        new ThrottlerExceptionHandler(),
        new DomainExceptionHandler(),
        new HttpExceptionHandler(),
        new UnknownErrorHandler(),
    ];

    constructor(private readonly logger: LoggerService) { }

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest();

        const handler = this.handlers.find((h) => h.canHandle(exception));

        const { status, message } = handler
            ? handler.handle(exception)
            : { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };

        const logMessage = `${request.method} ${request.url} - ${status} ${JSON.stringify(message)}`;

        if (status >= 500) {
            this.logger.error(logMessage, exception instanceof Error ? exception.stack : undefined, 'DomainExceptionFilter');
        } else {
            this.logger.warn(logMessage, 'DomainExceptionFilter');
        }

        response.status(status).json({
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
        });
    }
}

