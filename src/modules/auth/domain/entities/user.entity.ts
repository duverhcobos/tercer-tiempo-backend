export class User {
    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly password: string,
        public readonly phone: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) { }

    static create(email: string, password: string, phone?: string): User {
        return new User(
            '', // El ID será generado por la base de datos
            email,
            password,
            phone || null,
            new Date(),
            new Date(),
        );
    }
}
