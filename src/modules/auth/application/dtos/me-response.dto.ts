import { UserRole } from '../../domain/enums/user-role.enum';

export class MeResponseDto {
    id!: string;
    email!: string;
    username!: string;
    role!: UserRole | null;
    status!: string;
    profileComplete!: boolean;
    createdAt!: Date;

    constructor(params: {
        id: string;
        email: string;
        username: string;
        role: UserRole | null;
        status: string;
        profileComplete: boolean;
        createdAt: Date;
    }) {
        Object.assign(this, params);
    }
}