import { DomainException } from "../../../../common/exceptions/domain.exception";



export class AccountSuspendedException extends DomainException {
    constructor() {
        super('Account has been suspended', 403, 'ACCOUNT_SUSPENDED');
    }
}