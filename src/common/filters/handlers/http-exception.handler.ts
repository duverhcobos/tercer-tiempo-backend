import { HttpException } from '@nestjs/common';
import { ExceptionHandler } from './exception-handler.interface';

export class HttpExceptionHandler implements ExceptionHandler {
    canHandle(exception: unknown): boolean {
        return exception instanceof HttpException;
    }

    handle(exception: HttpException): { status: number; message: string | string[] } {
        const status = exception.getStatus();
        const exceptionResponse = exception.getResponse();
        const message =
            typeof exceptionResponse === 'object' && 'message' in exceptionResponse
                ? (exceptionResponse as { message: string | string[] }).message
                : exception.message;

        return { status, message };
    }
}
