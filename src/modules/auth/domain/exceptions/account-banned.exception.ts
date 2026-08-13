import { DomainException } from "../../../../common/exceptions/domain.exception";



export class AccountBannedException extends DomainException {
    constructor() {
        super('Account has been banned', 403, 'ACCOUNT_BANNED');
    }
}