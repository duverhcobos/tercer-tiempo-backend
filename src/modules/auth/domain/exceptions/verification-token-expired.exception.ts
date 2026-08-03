import { DomainException } from '../../../../common/exceptions/domain.exception';

export class VerificationTokenExpiredException extends DomainException {
    constructor() {
        super('Verification token has expired', 400, 'VERIFICATION_TOKEN_EXPIRED');
    }
}