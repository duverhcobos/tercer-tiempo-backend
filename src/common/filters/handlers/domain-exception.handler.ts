import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../exceptions/domain.exception';
import { ExceptionHandler } from './exception-handler.interface';

export class DomainExceptionHandler implements ExceptionHandler {
    canHandle(exception: unknown): boolean {
        return exception instanceof DomainException;
    }

    handle(exception: DomainException): { status: number; message: string; errorCode?: string } {
        return {
            status: exception.httpStatus ?? HttpStatus.BAD_REQUEST,
            message: exception.message,
            errorCode: exception.errorCode,
        };
    }
}