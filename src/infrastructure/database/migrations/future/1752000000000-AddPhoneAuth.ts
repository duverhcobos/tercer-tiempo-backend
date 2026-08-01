import { MigrationInterface, QueryRunner } from 'typeorm';

// ╔═════════════════════════════════════════════════════╗
// ║  FASE 3 — AUTENTICACIÓN POR TELÉFONO / SMS         ║
// ╠═════════════════════════════════════════════════════╣
// ║  Funcionalidad habilitada:                          ║
// ║    ✓ Registro/login con número de teléfono          ║
// ║    ✓ Verificación de teléfono por OTP SMS           ║
// ║    ✓ Formato E.164 obligatorio (+573001112233)      ║
// ║                                                     ║
// ║  Dependencia: Fase 1 debe estar ejecutada.          ║
// ║  Modifica: tabla users (ADD COLUMN phone_number)    ║
// ║            ENUM verification_type (ADD VALUE)       ║
// ╚═════════════════════════════════════════════════════╝

export class AddPhoneAuth1752000000000 implements MigrationInterface {
  name = 'AddPhoneAuth1752000000000';

  // ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción.
  // TypeORM envuelve las migraciones en BEGIN/COMMIT por defecto,
  // por lo que deshabilitamos ese comportamiento aquí.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensión del ENUM verification_type ─────────────────
    // Agrega el tipo 'phone_verification' para OTP por SMS.
    // IF NOT EXISTS previene error si se corre más de una vez.
    await queryRunner.query(
      `ALTER TYPE "verification_type" ADD VALUE IF NOT EXISTS 'phone_verification'`,
    );

    // ── Nuevo campo: phone_number ─────────────────────────────
    // Nullable porque los usuarios registrados con email/OAuth
    // no tienen teléfono obligatorio.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_number" VARCHAR(20)`,
    );

    // ── CHECK E.164 ───────────────────────────────────────────
    // Formato internacional: +573001112233 (+ seguido de 7-15 dígitos).
    // Se agrega solo si la columna se creó (IF NOT EXISTS no aplica a CONSTRAINTs).
    await queryRunner.query(String.raw`
      ALTER TABLE "users"
      ADD CONSTRAINT "chk_phone_e164"
        CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9]\d{6,14}$')
    `);

    // ── Índice único parcial ──────────────────────────────────
    // Solo indexa filas donde phone_number no es NULL,
    // así permite múltiples usuarios sin teléfono registrado.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uidx_users_phone"
       ON "users"("phone_number") WHERE phone_number IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uidx_users_phone"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "chk_phone_e164"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "phone_number"`,
    );

    // NOTA: PostgreSQL no permite eliminar valores de un ENUM.
    // El valor 'phone_verification' permanecerá en verification_type.
    // Si se necesita revertir completamente, recrear el ENUM manualmente.
  }
}
