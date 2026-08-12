import { GenderType } from "../enums/gender-type.enum";

export class UserProfile {
    constructor(
        public readonly userId: string,
        public readonly firstName1: string,
        public readonly firstName2: string | null,
        public readonly lastName1: string,
        public readonly lastName2: string | null,
        public readonly birthDate: string,
        public readonly gender: GenderType,
        public readonly countryId: string | null,
        public readonly timezone: string,
        public readonly locale: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) { }
}