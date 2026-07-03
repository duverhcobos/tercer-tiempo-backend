import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';

@Injectable()
export class LoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService,
    ) { }

    async execute(email: string, password: string): Promise<User> {
        // Validar email
        const emailVO = new Email(email);

        // Buscar usuario
        const user = await this.userRepository.findByEmail(emailVO.getValue());
        if (!user) {
            throw new InvalidCredentialsException();
        }

        // Verificar contraseña — usuarios que solo usan Google no tienen password
        if (!user.password) {
            throw new InvalidCredentialsException();
        }

        const isPasswordValid = await this.bcryptService.compare(password, user.password);
        if (!isPasswordValid) {
            throw new InvalidCredentialsException();
        }

        return user;
    }
}
