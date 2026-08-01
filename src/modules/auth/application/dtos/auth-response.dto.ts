import { UserRole } from "../../domain/enums/user-role.enum"

export class AuthResponseDto {
    id: string;
    email: string;
    username: string;
    role: UserRole | null;
    accessToken: string;
    createdAt: Date;
    isNewUser: boolean;
    constructor(
        id: string,
        email: string,
        username: string,
        role: UserRole | null,
        accessToken: string,
        createdAt: Date,
        isNewUser: boolean
    ){
        this.id = id;
        this.email = email;
        this.username = username;
        this.role = role;
        this.accessToken = accessToken;
        this.createdAt = createdAt;
        this.isNewUser = isNewUser;
    }
}