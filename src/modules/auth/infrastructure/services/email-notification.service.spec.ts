import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { EmailNotificationService } from './email-notification.service';

interface SendEmailArgs {
    from: string;
    to: string;
    subject: string;
    html: string;
}

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

            const [call] = mockSend.mock.calls[0] as [SendEmailArgs];
            expect(call.from).toBe('noreply@3tiempo.com');
            expect(call.to).toBe(PAYLOAD.to);
            expect(call.subject).toContain('Verifica');
            expect(call.html).toContain(
                `http://localhost:3000/auth/verify-email?token=${PAYLOAD.token}`,
            );
        });

        it('incluye el token en el cuerpo del email como texto plano', async () => {
            mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

            await service.sendVerificationEmail(PAYLOAD);

            const [call] = mockSend.mock.calls[0] as [SendEmailArgs];
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
