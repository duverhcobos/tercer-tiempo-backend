import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'token must be exactly 64 characters' })
    token!: string;
}