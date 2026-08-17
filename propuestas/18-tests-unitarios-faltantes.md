# Propuesta: Completar tests unitarios faltantes (get-me, resend-verification, email-notification)

**Estado:** ✅ Completado — `get-me.use-case.spec.ts`, `resend-verification.use-case.spec.ts` y `email-notification.service.spec.ts` existen en `src/`.

## Problema

Según el checklist de pruebas unitarias definido en `AGENTS.md` (*"SIEMPRE requieren `.spec.ts`"*), todo `use-case` y todo `service` de infraestructura con lógica propia debe tener su spec junto al archivo. Al auditar el proyecto contra esa regla, tres archivos con lógica de negocio real no tienen `.spec.ts`:

| Archivo | Capa | Lógica que queda sin cubrir |
|---------|------|------------------------------|
| `src/modules/auth/application/use-cases/get-me.use-case.ts` | `application/use-cases` | Usuario no encontrado (`UnauthorizedException`), armado del `MeResponseDto` con `profileComplete` |
| `src/modules/auth/application/use-cases/resend-verification.use-case.ts` | `application/use-cases` | Email no enumerado si no existe, `EmailAlreadyVerifiedException`, invalidación de tokens previos, generación de token nuevo, envío de email |
| `src/modules/auth/infrastructure/services/email-notification.service.ts` | `infrastructure/services` | Armado del HTML/URL de verificación, manejo de error de Resend (no relanza excepción) |

El resto de use-cases (`login`, `register`, `verify-email`) y servicios de infraestructura (`bcrypt`, `jwt`) ya están cubiertos y sirven de referencia de estilo para estos nuevos specs.

## Solución

Agregar los tres `.spec.ts` siguiendo exactamente el mismo patrón ya usado en el proyecto: `@nestjs/testing` + `Test.createTestingModule` + mocks tipados con `jest.Mocked<T>`, mockeando los repositorios/servicios inyectados y probando happy path + cada excepción de dominio + ausencia de efectos secundarios cuando el flujo falla antes de tiempo.

Para `EmailNotificationService` se mockea el SDK `resend` con `jest.mock('resend')`, ya que es una dependencia externa (igual que `bcrypt`/`jsonwebtoken` se usan reales en sus specs porque son deterministas — `resend` en cambio hace I/O de red, así que se mockea).

No se modifica ningún archivo de `src/` fuera de agregar los tres specs.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/use-cases/get-me.use-case.spec.ts` | Crear |
| `src/modules/auth/application/use-cases/resend-verification.use-case.spec.ts` | Crear |
| `src/modules/auth/infrastructure/services/email-notification.service.spec.ts` | Crear |

---

## 1. `get-me.use-case.spec.ts`

**Ruta:** `src/modules/auth/application/use-cases/get-me.use-case.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';

import { GetMeUseCase } from './get-me.use-case';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';

describe('GetMeUseCase', () => {
    let useCase: GetMeUseCase;
    let userRepository: jest.Mocked<IUserRepository>;

    const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

    function buildUser(status: string = 'active'): User {
        return new User(
            USER_ID,
            'jugador@ejemplo.com',
            'jugador_10',
            'hashed_password',
            status,
            new Date('2026-01-01T00:00:00Z'),
            new Date('2026-01-01T00:00:00Z'),
            UserRole.PLAYER,
        );
    }

    beforeEach(async () => {
        const mockUserRepository = {
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
            findById: jest.fn(),
            findByEmailWithRole: jest.fn(),
            registerWithRole: jest.fn(),
            updateLastLoginAt: jest.fn(),
            updateStatus: jest.fn(),
            hasProfile: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GetMeUseCase,
                { provide: USER_REPOSITORY, useValue: mockUserRepository },
            ],
        }).compile();

        useCase = module.get<GetMeUseCase>(GetMeUseCase);
        userRepository = module.get(USER_REPOSITORY);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('retorna el MeResponseDto con profileComplete=true cuando el usuario tiene perfil', async () => {
            const user = buildUser();
            userRepository.findById.mockResolvedValue(user);
            userRepository.hasProfile.mockResolvedValue(true);

            const result = await useCase.execute(USER_ID);

            expect(userRepository.findById).toHaveBeenCalledWith(USER_ID);
            expect(userRepository.hasProfile).toHaveBeenCalledWith(USER_ID);
            expect(result).toEqual({
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
                status: user.status,
                profileComplete: true,
                createdAt: user.createdAt,
            });
        });

        it('retorna profileComplete=false cuando el usuario no ha completado el onboarding', async () => {
            userRepository.findById.mockResolvedValue(buildUser());
            userRepository.hasProfile.mockResolvedValue(false);

            const result = await useCase.execute(USER_ID);

            expect(result.profileComplete).toBe(false);
        });

        it('lanza UnauthorizedException si el usuario ya no existe', async () => {
            userRepository.findById.mockResolvedValue(null);

            await expect(useCase.execute(USER_ID)).rejects.toThrow(UnauthorizedException);
            expect(userRepository.hasProfile).not.toHaveBeenCalled();
        });
    });
});
```

---

## 2. `resend-verification.use-case.spec.ts`

**Ruta:** `src/modules/auth/application/use-cases/resend-verification.use-case.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';

import { ResendVerificationUseCase } from './resend-verification.use-case';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { IVerificationRepository, VERIFICATION_REPOSITORY } from '../../domain/repositories/verification.repository.interface';
import {
    EMAIL_NOTIFICATION_SERVICE,
    IEmailNotificationService,
} from '../../infrastructure/services/email-notification.service';
import { EmailAlreadyVerifiedException } from '../../domain/exceptions/email-already-verified.exception';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';

describe('ResendVerificationUseCase', () => {
    let useCase: ResendVerificationUseCase;
    let userRepository: jest.Mocked<IUserRepository>;
    let verificationRepository: jest.Mocked<IVerificationRepository>;
    let emailService: jest.Mocked<IEmailNotificationService>;

    const EMAIL = 'jugador@ejemplo.com';

    function buildUser(status: string): User {
        return new User(
            '123e4567-e89b-12d3-a456-426614174000',
            EMAIL,
            'jugador_10',
            'hashed_password',
            status,
            new Date(),
            new Date(),
            UserRole.PLAYER,
        );
    }

    beforeEach(async () => {
        const mockUserRepository = {
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
            findById: jest.fn(),
            findByEmailWithRole: jest.fn(),
            registerWithRole: jest.fn(),
            updateLastLoginAt: jest.fn(),
            updateStatus: jest.fn(),
            hasProfile: jest.fn(),
        };

        const mockVerificationRepository = {
            create: jest.fn(),
            findByToken: jest.fn(),
            markAsUsed: jest.fn(),
            invalidatePreviousTokens: jest.fn(),
        };

        const mockEmailService = {
            sendVerificationEmail: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ResendVerificationUseCase,
                { provide: USER_REPOSITORY, useValue: mockUserRepository },
                { provide: VERIFICATION_REPOSITORY, useValue: mockVerificationRepository },
                { provide: EMAIL_NOTIFICATION_SERVICE, useValue: mockEmailService },
            ],
        }).compile();

        useCase = module.get<ResendVerificationUseCase>(ResendVerificationUseCase);
        userRepository = module.get(USER_REPOSITORY);
        verificationRepository = module.get(VERIFICATION_REPOSITORY);
        emailService = module.get(EMAIL_NOTIFICATION_SERVICE);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('no hace nada (sin error) si el email no existe, para no enumerar usuarios', async () => {
            userRepository.findByEmail.mockResolvedValue(null);

            await expect(useCase.execute(EMAIL)).resolves.toBeUndefined();
            expect(verificationRepository.invalidatePreviousTokens).not.toHaveBeenCalled();
            expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('lanza EmailAlreadyVerifiedException si la cuenta ya está activa', async () => {
            userRepository.findByEmail.mockResolvedValue(buildUser('active'));

            await expect(useCase.execute(EMAIL)).rejects.toThrow(EmailAlreadyVerifiedException);
            expect(verificationRepository.invalidatePreviousTokens).not.toHaveBeenCalled();
            expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('invalida tokens previos, crea uno nuevo y envía el email cuando la cuenta está pendiente', async () => {
            const user = buildUser('pending_verification');
            userRepository.findByEmail.mockResolvedValue(user);

            await useCase.execute(EMAIL);

            expect(verificationRepository.invalidatePreviousTokens).toHaveBeenCalledWith(
                user.id,
                'email_verification',
            );
            expect(verificationRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: user.id,
                    type: 'email_verification',
                    token: expect.any(String),
                    expiresAt: expect.any(Date),
                }),
            );
            expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: user.email }),
            );
        });

        it('genera un token nuevo de 64 caracteres hexadecimales', async () => {
            userRepository.findByEmail.mockResolvedValue(buildUser('pending_verification'));

            await useCase.execute(EMAIL);

            const createCall = verificationRepository.create.mock.calls[0][0];
            expect(createCall.token).toMatch(/^[0-9a-f]{64}$/);
        });

        it('fija la expiración del token en 24 horas', async () => {
            const now = Date.now();
            userRepository.findByEmail.mockResolvedValue(buildUser('pending_verification'));

            await useCase.execute(EMAIL);

            const createCall = verificationRepository.create.mock.calls[0][0];
            const diffHours = (createCall.expiresAt.getTime() - now) / (1000 * 60 * 60);
            expect(diffHours).toBeGreaterThan(23.9);
            expect(diffHours).toBeLessThanOrEqual(24);
        });
    });
});
```

---

## 3. `email-notification.service.spec.ts`

**Ruta:** `src/modules/auth/infrastructure/services/email-notification.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { EmailNotificationService } from './email-notification.service';

const mockSend = jest.fn();

jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({
        emails: { send: mockSend },
    })),
}));

describe('EmailNotificationService', () => {
    let service: EmailNotificationService;

    const CONFIG: Record<string, string> = {
        'email.resendApiKey': 're_test_key',
        'email.fromEmail': 'noreply@3tiempo.com',
        'email.appUrl': 'http://localhost:3000',
    };

    const PAYLOAD = {
        to: 'jugador@ejemplo.com',
        token: 'a'.repeat(64),
        expiresAt: new Date('2026-01-02T12:00:00Z'),
    };

    beforeEach(async () => {
        const mockConfigService = {
            get: jest.fn((key: string) => CONFIG[key]),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmailNotificationService,
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<EmailNotificationService>(EmailNotificationService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('sendVerificationEmail', () => {
        it('envía el email con el remitente configurado y un link de verificación con el token', async () => {
            mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

            await service.sendVerificationEmail(PAYLOAD);

            expect(mockSend).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: 'noreply@3tiempo.com',
                    to: PAYLOAD.to,
                    subject: expect.stringContaining('Verifica'),
                    html: expect.stringContaining(
                        `http://localhost:3000/auth/verify-email?token=${PAYLOAD.token}`,
                    ),
                }),
            );
        });

        it('incluye el token en el cuerpo del email como texto plano', async () => {
            mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

            await service.sendVerificationEmail(PAYLOAD);

            const call = mockSend.mock.calls[0][0];
            expect(call.html).toContain(PAYLOAD.token);
        });

        it('no lanza excepción si Resend responde con error (el usuario ya fue registrado)', async () => {
            mockSend.mockResolvedValue({
                data: null,
                error: { name: 'validation_error', message: 'domain not verified' },
            });

            await expect(service.sendVerificationEmail(PAYLOAD)).resolves.toBeUndefined();
        });

        it('no lanza excepción si el SDK de Resend rechaza la promesa', async () => {
            mockSend.mockResolvedValue({ data: null, error: { name: 'timeout' } });

            await expect(service.sendVerificationEmail(PAYLOAD)).resolves.toBeUndefined();
        });
    });
});
```

---

## Notas

- `EmailNotificationService` no expone actualmente ningún método para inspeccionar el error internamente (solo lo loguea), por lo que los tests validan el *comportamiento observable* (no lanza excepción, llama a `send` con los parámetros correctos) en vez de mockear el `Logger`.
- Estos tres archivos ya caen dentro de `collectCoverageFrom` de `package.json` (no están en la lista de exclusión), así que no se requiere tocar `package.json` en esta propuesta.
- Si se aplica primero la propuesta `17-remover-codigo-muerto-google-oauth.md`, no hay conflicto: ninguno de los tres archivos tocados aquí depende de `google-login.use-case.ts` ni de `google.strategy.ts`.

## Orden de aplicación

1. Crear `get-me.use-case.spec.ts`.
2. Crear `resend-verification.use-case.spec.ts`.
3. Crear `email-notification.service.spec.ts`.
4. Ejecutar `npm run test` y confirmar que los 3 specs nuevos pasan en verde junto con el resto de la suite.
5. Ejecutar `npm run test:cov` y confirmar que el % de cobertura de `application/use-cases` e `infrastructure/services` sube respecto a la corrida anterior.
