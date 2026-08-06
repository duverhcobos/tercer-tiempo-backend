import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
    @IsEmail({}, { message: 'email must be an email' })
    @IsNotEmpty({ message: 'email should not be empty' })
    email!: string;
}
