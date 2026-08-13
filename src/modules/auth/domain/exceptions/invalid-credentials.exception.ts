import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidCredentialsException extends DomainException {
    constructor() {
        super('Invalid credentials', 401, 'INVALID_CREDENTIALS');
        this.name = 'InvalidCredentialsException';
    }
}
