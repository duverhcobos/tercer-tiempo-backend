import { DomainException } from '../../../../common/exceptions/domain.exception';

export class EmailAlreadyVerifiedException extends DomainException {
    constructor() {
        super('Email address is already verified', 409, 'EMAIL_ALREADY_VERIFIED');
    }
}