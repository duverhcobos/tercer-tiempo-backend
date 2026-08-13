import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { UserProfile } from '../../domain/entities/user-profile.entity';
import {
    IUserProfileRepository,
    USER_PROFILE_REPOSITORY,
} from '../../domain/repositories/user-profile.repository.interface';
import { ProfileAlreadyExistsException } from '../../domain/exceptions/profile-already-exists.exception';
import { CreateProfileDto } from '../dtos/create-profile.dto';
import {
    IUserRepository,
    USER_REPOSITORY,
} from '../../../auth/domain/repositories/user.repository.interface';

@Injectable()
export class CreateProfileUseCase {
    constructor(
        @Inject(USER_PROFILE_REPOSITORY)
        private readonly profileRepository: IUserProfileRepository,
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
    ) {}

    async execute(userId: string, dto: CreateProfileDto): Promise<UserProfile> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            // El JWT era válido pero el usuario fue eliminado después de emitirlo
            throw new UnauthorizedException('User no longer exists');
        }

        const existing = await this.profileRepository.findByUserId(userId);
        if (existing) throw new ProfileAlreadyExistsException();

        const profile = new UserProfile(
            userId,
            dto.firstName1,
            dto.firstName2 ?? null,
            dto.lastName1,
            dto.lastName2 ?? null,
            dto.birthDate,
            dto.gender,
            dto.countryId ?? null,
            dto.timezone ?? 'UTC',
            dto.locale ?? 'es',
            new Date(),
            new Date(),
        );

        return this.profileRepository.create(profile);
    }
}