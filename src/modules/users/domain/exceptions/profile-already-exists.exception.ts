import { DomainException } from '../../../../common/exceptions/domain.exception';

export class ProfileAlreadyExistsException extends DomainException {
    constructor() {
        super('User profile already exists', 409, 'PROFILE_ALREADY_EXISTS');
    }
}