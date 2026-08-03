import { IEmailNotificationService } from '../../src/modules/auth/infrastructure/services/email-notification.service';

/**
 * Mock de IEmailNotificationService para tests e2e.
 *
 * Evita llamadas reales a la API de Resend durante la suite de tests:
 * - Elimina el ruido de errores 403 (dominio no verificado en modo de prueba).
 * - Desacopla los tests de un servicio externo real (disponibilidad, cuota, latencia).
 *
 * Uso en cada spec (dentro de beforeAll, antes de .compile()):
 *
 *   const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
 *       .overrideProvider(EMAIL_NOTIFICATION_SERVICE)
 *       .useValue(mockEmailNotificationService)
 *       .compile();
 */
export const mockEmailNotificationService: IEmailNotificationService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
};
