import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UserNotFoundException extends DomainException {
    constructor(email: string) {
        super(`User with email ${email} not found`, 404, 'USER_NOT_FOUND');
        this.name = 'UserNotFoundException';
    }
}
