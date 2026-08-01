import {User}  from "../entities/user.entity";
import {UserRole} from "../enums/user-role.enum";

export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    registerWithRole(user: User, role: UserRole): Promise<User>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');