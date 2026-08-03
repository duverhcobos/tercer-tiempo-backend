import { IsString, IsInt, Min, Max, IsNotEmpty } from 'class-validator';

export class EnvironmentVariables {
    @IsString()
    @IsNotEmpty()
    DB_HOST!: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    DB_PORT!: number;

    @IsString()
    @IsNotEmpty()
    DB_USERNAME!: string;

    @IsString()
    @IsNotEmpty()
    DB_PASSWORD!: string;

    @IsString()
    @IsNotEmpty()
    DB_DATABASE!: string;

    @IsString()
    @IsNotEmpty()
    JWT_SECRET!: string;

    @IsString()
    @IsNotEmpty()
    JWT_EXPIRES_IN!: string;

    @IsString()
    @IsNotEmpty()
    RESEND_API_KEY!: string;

    @IsString()
    @IsNotEmpty()
    EMAIL_FROM!: string;

    @IsString()
    @IsNotEmpty()
    APP_URL!: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CLIENT_ID!: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CLIENT_SECRET!: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CALLBACK_URL!: string;
}
