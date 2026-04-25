import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UserAlreadyExistsException extends DomainException {
    constructor(email: string) {
        super(`User with email ${email} already exists`, 409);
        this.name = 'UserAlreadyExistsException';
    }
}
