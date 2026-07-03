import { HttpStatus } from '@nestjs/common';
import { ExceptionHandler } from './exception-handler.interface';

export class UnknownErrorHandler implements ExceptionHandler {
    canHandle(exception: unknown): boolean {
        return exception instanceof Error;
    }

    handle(exception: Error): { status: number; message: string } {
        return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: exception.message,
        };
    }
}
