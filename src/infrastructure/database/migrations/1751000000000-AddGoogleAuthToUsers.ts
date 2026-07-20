import { MigrationInterface, QueryRunner } from 'typeorm';

// ╔═════════════════════════════════════════════════════════════╗
// ║  FASE 2 — AUTENTICACIÓN SOCIAL (GOOGLE, APPLE…)            ║
// ╠═════════════════════════════════════════════════════════════╣
// ║  Funcionalidad habilitada:                                  ║
// ║    ✓ Login con Google / Apple / Facebook / GitHub           ║
// ║    ✓ Vinculación de múltiples proveedores por usuario       ║
// ║    ✓ Desvinculación de proveedor (soft delete)              ║
// ║    ✓ Registro sin contraseña (OAuth-only accounts)          ║
// ║                                                             ║
// ║  Usa tabla user_social_identities en lugar de columna       ║
// ║  google_id directa, permitiendo N proveedores por usuario.  ║
// ║                                                             ║
// ║  Actualizar también en el codebase:                         ║
// ║    • src/infrastructure/database/schemas/user.schema.ts     ║
// ║    • src/modules/auth/domain/entities/user.entity.ts        ║
// ║    • src/modules/auth/infrastructure/mappers/user.mapper.ts ║
// ╚═════════════════════════════════════════════════════════════╝

export class AddGoogleAuthToUsers1751000000000 implements MigrationInterface {
  name = 'AddGoogleAuthToUsers1751000000000';

  // ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción.
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Nuevo ENUM: oauth_provider ────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "oauth_provider" AS ENUM(
        'google', 'apple', 'facebook', 'github', 'microsoft'
      )
    `);

    // ── Extensión de ENUMs existentes ─────────────────────────
    // ALTER TYPE ADD VALUE no puede ejecutarse dentro de una transacción
    // explícita; transaction = false lo habilita.
    await queryRunner.query(
      `ALTER TYPE "verification_type" ADD VALUE IF NOT EXISTS 'change_email'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'oauth_linked'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'oauth_unlinked'`,
    );

    // ── password_hash pasa a ser opcional ─────────────────────
    // Los usuarios OAuth no tienen contraseña local.
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "password_hash" DROP NOT NULL
    `);

    // ── Nueva tabla: user_social_identities ───────────────────
    // Un usuario puede tener Google + Apple + GitHub sin columnas
    // extras en users por cada proveedor.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_social_identities" (
        "id"          BIGSERIAL      PRIMARY KEY,
        "user_id"     UUID           NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider"    oauth_provider NOT NULL,
        "provider_id" VARCHAR(255)   NOT NULL,
        "created_at"  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"  TIMESTAMP,
        UNIQUE("provider", "provider_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_social_identities_user"
       ON "user_social_identities"("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_social_identities"`);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "password_hash" SET NOT NULL
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "oauth_provider"`);
  }
}
