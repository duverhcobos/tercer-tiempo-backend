import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseSchema {
    @ApiProperty({
        description: 'Unique user ID',
        example: '550e8400-e29b-41d4-a716-446655440000',
        type: String,
        format: 'uuid',
    })
    id: string;

    @ApiProperty({
        description: 'User email address',
        example: 'user@example.com',
        type: String,
        format: 'email',
    })
    email: string;

    @ApiProperty({
        description: 'JWT access token (valid for 24 h by default)',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        type: String,
    })
    accessToken: string;

    @ApiProperty({
        description: 'Account creation date',
        example: '2026-01-24T20:30:00.000Z',
        type: String,
        format: 'date-time',
    })
    createdAt: Date;
}
