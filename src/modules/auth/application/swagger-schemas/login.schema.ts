import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginSchema {
    @ApiProperty({
        description: 'Registered user email',
        example: 'user@example.com',
        type: String,
        format: 'email',
    })
    @IsEmail({}, { message: 'Invalid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email: string;

    @ApiProperty({
        description: 'User password',
        example: 'Password123',
        type: String,
    })
    @IsString({ message: 'Password must be a string' })
    @IsNotEmpty({ message: 'Password is required' })
    password: string;
}
