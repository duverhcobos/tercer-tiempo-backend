export abstract class DomainException extends Error {
    readonly httpStatus?: number;
    readonly errorCode?: string;

    constructor(message: string, httpStatus?: number, errorCode?: string) {
        super(message);
        this.name = this.constructor.name;
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
        Error.captureStackTrace(this, this.constructor);
    }
}
