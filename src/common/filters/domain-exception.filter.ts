import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../logger/logger.service';
import { DomainException } from '../exceptions/domain.exception';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
    constructor(private readonly logger: LoggerService) { }

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';

        if (exception instanceof DomainException) {
            status = exception.httpStatus ?? HttpStatus.BAD_REQUEST;
            message = exception.message;
            this.logger.warn(`Domain exception [${exception.name}]: ${message}`, 'DomainExceptionFilter');
        } else if (exception instanceof HttpException) {
            status = exception.getStatus();
            message = exception.message;
            this.logger.error(
                `HTTP exception: ${message}`,
                exception.stack,
                'DomainExceptionFilter',
            );
        } else if (exception instanceof Error) {
            message = exception.message;
            this.logger.error(
                `Unhandled error: ${message}`,
                exception.stack,
                'DomainExceptionFilter',
            );
        }

        this.logger.error(
            `${request.method} ${request.url} - ${status} ${message}`,
            exception instanceof Error ? exception.stack : undefined,
            'DomainExceptionFilter',
        );

        response.status(status).json({
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
        });
    }
}
