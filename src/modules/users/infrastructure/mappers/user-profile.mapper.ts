import { UserProfile } from '../../domain/entities/user-profile.entity';
import { GenderType } from '../../domain/enums/gender-type.enum';
import { UserProfileSchema } from '../../../../infrastructure/database/schemas/user-profile.schema';

export class UserProfileMapper {
    static toDomain(schema: UserProfileSchema): UserProfile {
        return new UserProfile(
            schema.userId,
            schema.firstName1,
            schema.firstName2,
            schema.lastName1,
            schema.lastName2,
            schema.birthDate,
            schema.gender as GenderType,
            schema.countryId,
            schema.timezone,
            schema.locale,
            schema.createdAt,
            schema.updatedAt,
        );
    }

    static toSchema(profile: UserProfile): UserProfileSchema {
        const schema = new UserProfileSchema();
        schema.userId     = profile.userId;
        schema.firstName1 = profile.firstName1;
        schema.firstName2 = profile.firstName2;
        schema.lastName1  = profile.lastName1;
        schema.lastName2  = profile.lastName2;
        schema.birthDate  = profile.birthDate;
        schema.gender     = profile.gender;
        schema.countryId  = profile.countryId;
        schema.timezone   = profile.timezone;
        schema.locale     = profile.locale;
        return schema;
    }
}