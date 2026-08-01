import { Inject, Injectable } from "@nestjs/common";
import { UserRole } from "../../domain/enums/user-role.enum";
import { IUserRepository, USER_REPOSITORY } from "../../domain/repositories/user.repository.interface";
import { BcryptService } from "../../infrastructure/services/bcrypt.service";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";
import { UserAlreadyExistsException } from "../../domain/exceptions/user-already-exists.exception";
import { UsernameAlreadyExistsException } from "../../domain/exceptions/username-already-exists.exception";
import { User } from "../../domain/entities/user.entity";


interface RegisterCommand {
    email: string;
    username: string;
    password: string;
    role: UserRole;

}

@Injectable()
export class RegisterUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService,
    ) {
    }

    async execute(command: RegisterCommand): Promise<User> {
        const emailVO = new Email(command.email);
        const passwordVO = new Password(command.password);

        const [existingByEmail, existingByUsername] = await Promise.all([
            this.userRepository.findByEmail(emailVO.getValue()),
            this.userRepository.findByUsername(command.username)
        ])

        if (existingByEmail) {
            throw new UserAlreadyExistsException(emailVO.getValue());
        }
        if (existingByUsername) {
            throw new UsernameAlreadyExistsException(command.username);
        }

        const hashedPassword = await this.bcryptService.hash(passwordVO.getValue());

        const user = User.create({
            role: command.role,
            password: hashedPassword,
            username: command.username,
            email: emailVO.getValue(),
            status: 'pending_verification',
        });

        const savedUser = await this.userRepository.registerWithRole(user, command.role);

        return new User(
            savedUser.id,
            savedUser.email,
            savedUser.username,
            savedUser.password,
            savedUser.status,
            savedUser.createdAt,
            savedUser.updatedAt,
            command.role,
        );


    }
}