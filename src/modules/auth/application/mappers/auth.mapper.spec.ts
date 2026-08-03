import { AuthMapper } from './auth.mapper';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { AuthResponseDto } from '../dtos/auth-response.dto';

describe('AuthMapper', () => {
    const user = new User(
        'user-id-1',
        'test@example.com',
        'test_user',
        'hashed_password',
        'active',
        new Date('2025-01-01'),
        new Date('2025-01-02'),
        UserRole.PLAYER,
    );
    const accessToken = 'jwt-token-abc';

    describe('toAuthResponse', () => {
        it('mapea un User a un AuthResponseDto con isNewUser=true', () => {
            const result = AuthMapper.toAuthResponse(user, accessToken, true);

            expect(result).toBeInstanceOf(AuthResponseDto);
            expect(result.id).toBe(user.id);
            expect(result.email).toBe(user.email);
            expect(result.username).toBe(user.username);
            expect(result.role).toBe(user.role);
            expect(result.accessToken).toBe(accessToken);
            expect(result.createdAt).toBe(user.createdAt);
            expect(result.isNewUser).toBe(true);
        });

        it('usa isNewUser=false por defecto cuando no se especifica', () => {
            const result = AuthMapper.toAuthResponse(user, accessToken);

            expect(result.isNewUser).toBe(false);
        });

        it('nunca incluye el password del usuario en la respuesta', () => {
            const result = AuthMapper.toAuthResponse(user, accessToken);

            expect(result).not.toHaveProperty('password');
            expect(JSON.stringify(result)).not.toContain(user.password);
        });
    });
});
