import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface VerificationEmailPayload {
    to: string;
    token: string;
    expiresAt: Date;
}

export const EMAIL_NOTIFICATION_SERVICE = Symbol('IEmailNotificationService');

export interface IEmailNotificationService {
    sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
}

@Injectable()
export class EmailNotificationService implements IEmailNotificationService {
    private readonly resend: Resend;
    private readonly logger = new Logger(EmailNotificationService.name);
    private readonly fromEmail: string;
    private readonly appUrl: string;

    constructor(private readonly configService: ConfigService) {
        this.resend = new Resend(this.configService.get<string>('email.resendApiKey')!);
        this.fromEmail = this.configService.get<string>('email.fromEmail')!;
        this.appUrl = this.configService.get<string>('email.appUrl')!;
    }

    async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
        const verifyUrl = `${this.appUrl}/auth/verify-email?token=${payload.token}`;

        const { error } = await this.resend.emails.send({
            from: this.fromEmail,
            to: payload.to,
            subject: 'Verifica tu cuenta en 3TIEMPO',
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                    <h2 style="color:#1e293b">Bienvenido a 3TIEMPO ⚽</h2>
                    <p>Haz clic en el botón para verificar tu correo electrónico:</p>
                    <a href="${verifyUrl}"
                       style="display:inline-block;padding:12px 24px;background:#2563eb;
                              color:#fff;text-decoration:none;border-radius:6px;
                              font-weight:600;margin:16px 0">
                        Verificar correo
                    </a>
                    <p style="color:#64748b;font-size:14px">
                        O copia este token en la aplicación:
                    </p>
                    <code style="display:block;background:#f1f5f9;padding:12px;
                                 border-radius:6px;font-size:13px;word-break:break-all">
                        ${payload.token}
                    </code>
                    <p style="color:#94a3b8;font-size:12px;margin-top:24px">
                        Este enlace expira el
                        ${payload.expiresAt.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}.
                        Si no creaste esta cuenta, ignora este correo.
                    </p>
                </div>
            `,
        });

        if (error) {
            this.logger.error(
                `Failed to send verification email to ${payload.to}: ${JSON.stringify(error)}`,
            );
            // No lanzamos excepción: el usuario ya fue registrado.
            // El correo puede reenviarse con POST /auth/resend-verification.
            return;
        }

        this.logger.log(`Verification email sent to ${payload.to}`);
    }
}