import { DomainException } from "src/common/exceptions/domain.exception";



export class AccountSuspendedException extends DomainException {
    constructor() {
        super('Account has been suspended', 403);
    }
}