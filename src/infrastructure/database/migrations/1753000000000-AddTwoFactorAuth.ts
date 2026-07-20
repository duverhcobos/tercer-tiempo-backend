import { MigrationInterface, QueryRunner } from 'typeorm';

// ╔═════════════════════════════════════════════════════╗
// ║  FASE 4 — AUTENTICACIÓN DE DOS FACTORES (2FA/TOTP) ║
// ╠═════════════════════════════════════════════════════╣
// ║  Funcionalidad habilitada:                          ║
// ║    ✓ 2FA con app TOTP (Google Authenticator, etc.) ║
// ║    ✓ Activación y desactivación de 2FA             ║
// ║    ✓ Registro de eventos 2FA en auditoría          ║
// ║                                                     ║
// ║  Dependencia: Fase 1 debe estar ejecutada.          ║
// ║  Modifica: tabla users (ADD COLUMN x2)              ║
// ║            ENUM audit_event_type (ADD VALUE x2)     ║
// ╚═════════════════════════════════════════════════════╝

export class AddTwoFactorAuth1753000000000 implements MigrationInterface {
  name = 'AddTwoFactorAuth1753000000000';

  // ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensión del ENUM audit_event_type ──────────────────
    // Los labels de ENUM en PostgreSQL no pueden empezar con un dígito,
    // por eso se usa 'two_fa_' en lugar de '2fa_'.
    await queryRunner.query(
      `ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'two_fa_enabled'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'two_fa_disabled'`,
    );

    // ── Nuevos campos en users ────────────────────────────────

    // Flag que indica si el usuario tiene 2FA activado.
    await queryRunner.query(
      `ALTER TABLE "users"
       ADD COLUMN IF NOT EXISTS "is_two_factor_enabled" BOOLEAN DEFAULT false`,
    );

    // Secreto TOTP compartido. DEBE cifrarse a nivel de aplicación
    // (ej. AES-256) antes de persistir. Nunca almacenar en texto plano.
    await queryRunner.query(
      `ALTER TABLE "users"
       ADD COLUMN IF NOT EXISTS "two_factor_secret" VARCHAR(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "two_factor_secret"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "is_two_factor_enabled"`,
    );

    // NOTA: PostgreSQL no permite eliminar valores de un ENUM.
    // Los valores 'two_fa_enabled' y 'two_fa_disabled' permanecerán
    // en audit_event_type. Recrear el ENUM manualmente si es necesario.
  }
}
