import { Inject, Injectable } from "@nestjs/common";
import { IUserRepository, USER_REPOSITORY } from "../../domain/repositories/user.repository.interface";
import { BcryptService } from "../../infrastructure/services/bcrypt.service";
import { User } from "../../domain/entities/user.entity";
import { InvalidCredentialsException } from "../../domain/exceptions/invalid-credentials.exception";
import { EmailNotVerifiedException } from "../../domain/exceptions/email-not-verified.exception";
import { AccountSuspendedException } from "../../domain/exceptions/account-suspended.exception";
import { AccountBannedException } from "../../domain/exceptions/account-banned.exception";



@Injectable()
export class LoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService
    ) { }

    async execute(command: { email: string, password: string }): Promise<User> {

        const user = await this.userRepository.findByEmailWithRole(command.email);
        user || (() => { throw new InvalidCredentialsException() })();

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        isPasswordValid || (() => { throw new InvalidCredentialsException() })();

        user.status === 'pending_verification' && (() => { throw new EmailNotVerifiedException() })();
        user.status === 'suspended' && (() => { throw new AccountSuspendedException() })();
        user.status === 'banned' && (() => { throw new AccountBannedException() })();

        await this.userRepository.updateLastLoginAt(user.id);

        return user;
    }

}