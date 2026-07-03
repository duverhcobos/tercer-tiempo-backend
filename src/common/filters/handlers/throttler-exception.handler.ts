import { HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ExceptionHandler } from './exception-handler.interface';

export class ThrottlerExceptionHandler implements ExceptionHandler {
    canHandle(exception: unknown): boolean {
        return exception instanceof ThrottlerException;
    }

    handle(): { status: number; message: string } {
        return {
            status: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please wait before trying again.',
        };
    }
}
