import { UserRole } from "../enums/user-role.enum";


interface CreateUserParams {
  email: string;
  username: string;
  password: string;
  status: string;
  role: UserRole;
}

export class User {

    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly username: string,
        public readonly password: string,        
        public readonly status: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly role: UserRole | null = null,
    ){}

    static create({
        email,
        username,
        password,
        status,
        role
    }: CreateUserParams): User{
        return new User(
            '',
            email,
            username,
            password,
            status,
            new Date(),
            new Date(),
            role
        );
    }
}
