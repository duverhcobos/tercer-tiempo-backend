import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UsernameAlreadyExistsException extends DomainException {
  constructor(username: string) {
    super(`Username ${username} is already taken`, 409);
    this.name = 'UsernameAlreadyExistsException';
  }
}