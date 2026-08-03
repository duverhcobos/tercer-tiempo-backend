import { DomainException } from "../../../../common/exceptions/domain.exception";


export class EmailNotVerifiedException extends DomainException {
    constructor() {
        super('Email address has not been verified', 403, 'EMAIL_NOT_VERIFIED');
    }
}

