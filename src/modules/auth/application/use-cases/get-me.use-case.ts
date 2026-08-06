import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { MeResponseDto } from '../dtos/me-response.dto';

@Injectable()
export class GetMeUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    ) { }

    async execute(userId: string): Promise<MeResponseDto> {
        const user = await this.userRepository.findById(userId);

        if (!user) {
            // El JWT era válido pero el usuario fue eliminado después de emitirlo
            throw new UnauthorizedException('User no longer exists');
        }

        const profileComplete = await this.userRepository.hasProfile(userId);

        return new MeResponseDto({
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            status: user.status,
            profileComplete,
            createdAt: user.createdAt,
        });
    }
}