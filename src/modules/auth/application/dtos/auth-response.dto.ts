export class AuthResponseDto {
    id: string;

    email: string;

    accessToken: string;

    createdAt: Date;

    isNewUser: boolean;

    constructor(id: string, email: string, accessToken: string, createdAt: Date, isNewUser = false) {
        this.id = id;
        this.email = email;
        this.accessToken = accessToken;
        this.createdAt = createdAt;
        this.isNewUser = isNewUser;
    }
}
