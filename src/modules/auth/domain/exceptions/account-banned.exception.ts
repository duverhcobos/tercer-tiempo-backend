import { DomainException } from "src/common/exceptions/domain.exception";



export class AccountBannedException extends DomainException {
    constructor() {
        super('Account has been banned', 403);
    }
}