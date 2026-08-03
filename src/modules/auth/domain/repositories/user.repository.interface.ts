import { User } from "../entities/user.entity";
import { UserRole } from "../enums/user-role.enum";

export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByEmailWithRole(email: string): Promise<User | null>;
    registerWithRole(user: User, role: UserRole): Promise<User>;
    updateLastLoginAt(userId: string): Promise<void>;
    updateStatus(userId: string, status: string): Promise<void>;
    hasProfile(userId: string): Promise<boolean>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');