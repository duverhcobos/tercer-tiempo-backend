import { UserProfile } from '../entities/user-profile.entity';

export interface IUserProfileRepository {
    findByUserId(userId: string): Promise<UserProfile | null>;
    create(profile: UserProfile): Promise<UserProfile>;
}

export const USER_PROFILE_REPOSITORY = Symbol('IUserProfileRepository');