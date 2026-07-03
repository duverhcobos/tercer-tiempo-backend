export class User {
    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly password: string | null,
        public readonly phone: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly googleId: string | null = null,
        public readonly avatarUrl: string | null = null,
    ) { }

    static create(email: string, password: string, phone?: string): User {
        return new User(
            '',
            email,
            password,
            phone || null,
            new Date(),
            new Date(),
        );
    }

    static createFromGoogle(email: string, googleId: string, avatarUrl?: string): User {
        return new User(
            '',
            email,
            null,
            null,
            new Date(),
            new Date(),
            googleId,
            avatarUrl || null,
        );
    }
}
