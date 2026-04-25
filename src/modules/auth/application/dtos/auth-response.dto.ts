export class AuthResponseDto {
    id: string;

    email: string;

    accessToken: string;

    createdAt: Date;

    constructor(id: string, email: string, accessToken: string, createdAt: Date) {
        this.id = id;
        this.email = email;
        this.accessToken = accessToken;
        this.createdAt = createdAt;
    }
}
