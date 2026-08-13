import { Transform } from 'class-transformer';
import {
    IsDateString,
    IsEnum,
    IsIn,
    IsISO31661Alpha2,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length,
    Matches,
} from 'class-validator';

import { GenderType } from '../../domain/enums/gender-type.enum';

export class CreateProfileDto {
    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    firstName1!: string;

    @IsOptional()
    @IsString()
    @Length(1, 50)
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    firstName2?: string;

    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    lastName1!: string;

    @IsOptional()
    @IsString()
    @Length(1, 50)
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    lastName2?: string;

    @IsDateString({}, { message: 'birthDate must be a valid date (YYYY-MM-DD)' })
    birthDate!: string;

    @IsEnum(GenderType, { message: 'gender must be M, F or other' })
    gender!: GenderType;

    @IsOptional()
    @IsISO31661Alpha2({ message: 'countryId must be a valid ISO 3166-1 alpha-2 code' })
    countryId?: string;

    @IsOptional()
    @IsString()
    @Matches(/^(UTC|GMT|[A-Za-z]+\/[A-Za-z0-9_+\-]+)$/, {
        message: 'timezone must be a valid IANA timezone',
    })
    timezone?: string;

    @IsOptional()
    @IsString()
    @IsIn(['es', 'en', 'pt', 'fr', 'de'], { message: 'locale must be es, en, pt, fr or de' })
    locale?: string;
}