import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterSchema {
    @ApiProperty({
        description: 'User email (must be unique)',
        example: 'user@example.com',
        type: String,
        format: 'email',
    })
    @IsEmail({}, { message: 'Invalid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email: string;

    @ApiProperty({
        description: 'User password (minimum 8 characters)',
        example: 'Password123',
        type: String,
        minLength: 8,
    })
    @IsString({ message: 'Password must be a string' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    password: string;
}
