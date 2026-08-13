import { UserProfile } from '../../domain/entities/user-profile.entity';
import { ProfileResponseDto } from '../dtos/profile-response.dto';

export class UserProfileMapper {
    static toResponseDto(profile: UserProfile): ProfileResponseDto {
        return new ProfileResponseDto({
            userId: profile.userId,
            firstName1: profile.firstName1,
            firstName2: profile.firstName2,
            lastName1: profile.lastName1,
            lastName2: profile.lastName2,
            birthDate: profile.birthDate,
            gender: profile.gender,
            countryId: profile.countryId,
            timezone: profile.timezone,
            locale: profile.locale,
            createdAt: profile.createdAt,
        });
    }
}