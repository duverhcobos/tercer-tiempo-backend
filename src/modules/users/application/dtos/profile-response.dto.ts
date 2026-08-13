import { GenderType } from '../../domain/enums/gender-type.enum';

export class ProfileResponseDto {
    userId!: string;
    firstName1!: string;
    firstName2!: string | null;
    lastName1!: string;
    lastName2!: string | null;
    birthDate!: string;
    gender!: GenderType;
    countryId!: string | null;
    timezone!: string;
    locale!: string;
    createdAt!: Date;

    constructor(params: {
        userId: string;
        firstName1: string;
        firstName2: string | null;
        lastName1: string;
        lastName2: string | null;
        birthDate: string;
        gender: GenderType;
        countryId: string | null;
        timezone: string;
        locale: string;
        createdAt: Date;
    }) {
        Object.assign(this, params);
    }
}