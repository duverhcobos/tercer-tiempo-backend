import { Injectable, Inject } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';

export interface GoogleProfile {
    googleId: string;
    email: string;
    avatarUrl?: string;
}

@Injectable()
export class GoogleLoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
    ) { }

    async execute(profile: GoogleProfile): Promise<{ user: User; isNewUser: boolean }> {
        // 1. Buscar por googleId
        let user = await this.userRepository.findByGoogleId(profile.googleId);

        if (user) {
            return { user, isNewUser: false };
        }

        // 2. Si ya tiene cuenta con ese email (registro normal), vincular el googleId
        user = await this.userRepository.findByEmail(profile.email);

        if (user) {
            const linked = new User(
                user.id,
                user.email,
                user.password,
                user.phone,
                user.createdAt,
                new Date(),
                profile.googleId,
                profile.avatarUrl || user.avatarUrl,
            );
            return { user: await this.userRepository.save(linked), isNewUser: false };
        }

        // 3. Crear cuenta nueva con Google
        const newUser = User.createFromGoogle(
            profile.email,
            profile.googleId,
            profile.avatarUrl,
        );

        return { user: await this.userRepository.save(newUser), isNewUser: true };
    }
}
