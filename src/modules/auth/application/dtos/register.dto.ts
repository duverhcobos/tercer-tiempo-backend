import { IsEmail, IsEnum, IsNotEmpty, IsString, Matches, MaxLength, MinLength, } from "class-validator";
import { UserRole } from "../../domain/enums/user-role.enum";

export class RegisterDto {

    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(3, { message: 'Username must be at least 3 characters' })
    @MaxLength(50, { message: 'Username must be at most 50 characters' })
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores' })
    username!: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;

    @IsEnum(UserRole, {
        message: `Role must be one of: ${Object.values(UserRole).join(', ')}`,
    })
    @IsNotEmpty({ message: 'Role is required' })
    role!: UserRole;
}