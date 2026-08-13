import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UsernameAlreadyExistsException extends DomainException {
  constructor(username: string) {
    super(`Username ${username} is already taken`, 409, 'USERNAME_ALREADY_EXISTS');
    this.name = 'UsernameAlreadyExistsException';
  }
}