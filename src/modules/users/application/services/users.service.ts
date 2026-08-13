import { Injectable } from '@nestjs/common';
import { CreateProfileDto } from '../dtos/create-profile.dto';
import { CreateProfileUseCase } from '../use-cases/create-profile.use-case';
import { ProfileResponseDto } from '../dtos/profile-response.dto';
import { UserProfileMapper } from '../mappers/user-profile.mapper';

@Injectable()
export class UsersService {
    constructor(private readonly createProfileUseCase: CreateProfileUseCase) {}

    async createProfile(userId: string, dto: CreateProfileDto): Promise<ProfileResponseDto> {
        const profile = await this.createProfileUseCase.execute(userId, dto);
        return UserProfileMapper.toResponseDto(profile);
    }
}