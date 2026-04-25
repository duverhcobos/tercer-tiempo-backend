import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { Password } from '../../domain/value-objects/password.vo';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { UserAlreadyExistsException } from '../../domain/exceptions/user-already-exists.exception';

@Injectable()
export class RegisterUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService,
    ) { }

    async execute(email: string, password: string, phone?: string): Promise<User> {
        // Validar usando Value Objects
        const emailVO = new Email(email);
        const passwordVO = new Password(password);

        // Verificar que el email no exista
        const existingUser = await this.userRepository.findByEmail(emailVO.getValue());
        if (existingUser) {
            throw new UserAlreadyExistsException(emailVO.getValue());
        }

        // Hashear la contraseña
        const hashedPassword = await this.bcryptService.hash(passwordVO.getValue());

        // Crear y guardar el usuario
        const user = User.create(emailVO.getValue(), hashedPassword, phone);
        return await this.userRepository.save(user);
    }
}
