export abstract class DomainException extends Error {
    readonly httpStatus?: number;

    constructor(message: string, httpStatus?: number) {
        super(message);
        this.name = this.constructor.name;
        this.httpStatus = httpStatus;
        Error.captureStackTrace(this, this.constructor);
    }
}
