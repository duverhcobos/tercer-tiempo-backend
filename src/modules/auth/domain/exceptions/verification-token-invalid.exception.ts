import { DomainException } from '../../../../common/exceptions/domain.exception';

export class VerificationTokenInvalidException extends DomainException {
    constructor() {
        super('Verification token is invalid or has already been used', 400, 'VERIFICATION_TOKEN_INVALID');
    }
}