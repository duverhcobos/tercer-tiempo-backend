import { MigrationInterface, QueryRunner } from 'typeorm';

// ╔═════════════════════════════════════════════════════╗
// ║  FASE 1 — AUTENTICACIÓN POR EMAIL / PASSWORD        ║
// ╠═════════════════════════════════════════════════════╣
// ║  Funcionalidad habilitada:                          ║
// ║    ✓ Registro con email + contraseña                ║
// ║    ✓ Inicio de sesión                               ║
// ║    ✓ Verificación de email (OTP)                    ║
// ║    ✓ Recuperación de contraseña                     ║
// ║    ✓ Gestión de sesiones multi-dispositivo          ║
// ║    ✓ Roles y permisos (RBAC)                        ║
// ║    ✓ Auditoría de seguridad básica                  ║
// ║                                                     ║
// ║  Crea: countries, users, user_profiles,             ║
// ║        user_sessions, verifications, roles,         ║
// ║        permissions, role_permissions, user_roles,   ║
// ║        security_audit_logs                          ║
// ╚═════════════════════════════════════════════════════╝

export class CreateUsersTable1706140000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Extensiones ──────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── ENUMs ────────────────────────────────────────────────
    // Se ampliarán en fases posteriores con ALTER TYPE ... ADD VALUE.
    await queryRunner.query(`
      CREATE TYPE "user_status" AS ENUM(
        'pending_verification', 'active', 'suspended', 'banned'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "gender_type" AS ENUM('M', 'F', 'other')
    `);
    // Fase 2 agrega 'change_email' | Fase 3 agrega 'phone_verification'
    await queryRunner.query(`
      CREATE TYPE "verification_type" AS ENUM(
        'email_verification', 'password_reset'
      )
    `);
    // Fase 2 agrega 'oauth_linked', 'oauth_unlinked' | Fase 4 agrega 'two_fa_*'
    await queryRunner.query(`
      CREATE TYPE "audit_event_type" AS ENUM(
        'login_success', 'login_failed', 'password_changed',
        'password_reset_requested', 'account_locked',
        'account_suspended', 'token_revoked'
      )
    `);

    // ── Función trigger: updated_at automático ───────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // ── Catálogo: countries ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "countries" (
        "code"         VARCHAR(2)   PRIMARY KEY,
        "name"         VARCHAR(100) NOT NULL,
        "phone_prefix" VARCHAR(5),
        "currency"     VARCHAR(3),
        "created_at"   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Tabla: users (solo autenticación) ────────────────────
    // NOTA: id usa UUID para compatibilidad con TypeORM/NestJS.
    //       El esquema SQL de referencia usa BIGSERIAL, pero el
    //       codebase completo está construido sobre UUID.
    // Datos personales separados en user_profiles.
    // Fase 3 agrega phone_number | Fase 4 agrega campos 2FA.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        "sync_id"       UUID         DEFAULT uuid_generate_v4() UNIQUE,
        "email"         VARCHAR(255) NOT NULL,
        "username"      VARCHAR(50)  NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "status"        user_status  DEFAULT 'pending_verification',
        "last_login_at" TIMESTAMP,
        "created_at"    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        "updated_at"    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"    TIMESTAMP
      )
    `);

    // Índices únicos case-insensitive (evita duplicados Duver/duver/DUVER)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uidx_users_email_lower"    ON "users"(LOWER(email))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uidx_users_username_lower" ON "users"(LOWER(username))`,
    );
    await queryRunner.query(
      `CREATE        INDEX "idx_users_status"          ON "users"("status")`,
    );

    await queryRunner.query(`
      CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON "users"
        FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at()
    `);

    // ── Tabla: user_profiles (datos personales) ──────────────
    // Separado de users: auth no necesita saber del nombre ni la foto.
    await queryRunner.query(String.raw`
      CREATE TABLE IF NOT EXISTS "user_profiles" (
        "user_id"        UUID         PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "first_name_1"   VARCHAR(50)  NOT NULL,
        "first_name_2"   VARCHAR(50),
        "last_name_1"    VARCHAR(50)  NOT NULL,
        "last_name_2"    VARCHAR(50),
        "avatar_file_id" VARCHAR(255),
        "birth_date"     DATE         NOT NULL,
        "gender"         gender_type  NOT NULL,
        "country_id"     VARCHAR(2)   REFERENCES "countries"("code") ON DELETE SET NULL,
        "timezone"       VARCHAR(50)  DEFAULT 'UTC',
        "locale"         VARCHAR(10)  DEFAULT 'es',
        "created_at"     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        "updated_at"     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"     TIMESTAMP,
        CONSTRAINT "chk_timezone_iana"
          CHECK (timezone ~ '^(UTC|GMT|[A-Za-z]+/[A-Za-z0-9_+\-]+)$')
      )
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_user_profiles_updated_at
        BEFORE UPDATE ON "user_profiles"
        FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at()
    `);

    // ── Tabla: user_sessions (refresh tokens) ────────────────
    // refresh_token_hash = SHA-256(token) en HEX. Nunca el token en texto plano.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "id"                 BIGSERIAL  PRIMARY KEY,
        "user_id"            UUID       NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "refresh_token_hash" CHAR(64)   UNIQUE NOT NULL,
        "device_id"          VARCHAR(255),
        "device_name"        VARCHAR(255),
        "ip_address"         INET,
        "user_agent"         TEXT,
        "is_revoked"         BOOLEAN    DEFAULT false,
        "expires_at"         TIMESTAMP  NOT NULL,
        "created_at"         TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
        "updated_at"         TIMESTAMP  DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_user_sessions_user"       ON "user_sessions"("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_sessions_expires_at" ON "user_sessions"("expires_at") WHERE is_revoked = false`,
    );

    await queryRunner.query(`
      CREATE TRIGGER trg_user_sessions_updated_at
        BEFORE UPDATE ON "user_sessions"
        FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at()
    `);

    // ── Tabla: verifications (OTP / reset de contraseña) ─────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "verifications" (
        "id"           BIGSERIAL         PRIMARY KEY,
        "user_id"      UUID              NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type"         verification_type NOT NULL,
        "token"        VARCHAR(255)      NOT NULL,
        "expires_at"   TIMESTAMP         NOT NULL,
        "used_at"      TIMESTAMP,
        "attempts"     SMALLINT          DEFAULT 0 NOT NULL,
        "max_attempts" SMALLINT          DEFAULT 5 NOT NULL,
        "created_at"   TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_attempts_not_exceeded" CHECK (attempts <= max_attempts)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_verifications_token"      ON "verifications"("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_verifications_expires_at" ON "verifications"("expires_at") WHERE used_at IS NULL`,
    );

    // ── RBAC: roles, permissions, role_permissions, user_roles ─
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id"          SERIAL      PRIMARY KEY,
        "name"        VARCHAR(50) UNIQUE NOT NULL,
        "description" TEXT,
        "created_at"  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id"          SERIAL       PRIMARY KEY,
        "name"        VARCHAR(100) UNIQUE NOT NULL,
        "description" TEXT,
        "created_at"  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "role_id"       INT       NOT NULL REFERENCES "roles"("id")       ON DELETE CASCADE,
        "permission_id" INT       NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        "created_at"    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("role_id", "permission_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "user_id"    UUID      NOT NULL REFERENCES "users"("id")  ON DELETE CASCADE,
        "role_id"    INT       NOT NULL REFERENCES "roles"("id")  ON DELETE CASCADE,
        "granted_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("user_id", "role_id")
      )
    `);

    // ── Tabla: security_audit_logs (inmutable) ───────────────
    // Sin updated_at ni deleted_at: los logs no se modifican ni eliminan.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "security_audit_logs" (
        "id"         BIGSERIAL        PRIMARY KEY,
        "user_id"    UUID             REFERENCES "users"("id") ON DELETE SET NULL,
        "event_type" audit_event_type NOT NULL,
        "ip_address" INET,
        "user_agent" TEXT,
        "metadata"   JSONB,
        "created_at" TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_user"    ON "security_audit_logs"("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_event"   ON "security_audit_logs"("event_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_metadata_gin" ON "security_audit_logs" USING GIN("metadata")`,
    );

    // ── Seeds ────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "countries" ("code", "name", "phone_prefix", "currency") VALUES
        ('CO', 'Colombia',       '+57', 'COP'),
        ('US', 'United States',  '+1',  'USD'),
        ('AR', 'Argentina',      '+54', 'ARS'),
        ('MX', 'México',         '+52', 'MXN'),
        ('ES', 'España',         '+34', 'EUR'),
        ('VE', 'Venezuela',      '+58', 'VES'),
        ('CL', 'Chile',          '+56', 'CLP'),
        ('PE', 'Perú',           '+51', 'PEN')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description") VALUES
        ('SUPERADMIN', 'Administrador global del sistema'),
        ('ORGANIZER',  'Dueño y gestor de torneos barriales'),
        ('REFEREE',    'Árbitro oficial para dirigir partidos'),
        ('PLAYER',     'Jugador inscrito al menos en un equipo'),
        ('SPECTATOR',  'Usuario que solo consume resultados en vivo')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "description") VALUES
        ('manage_users',      'Gestionar, banear o editar usuarios'),
        ('create_tournament', 'Abrir y configurar nuevos torneos'),
        ('report_match',      'Reportar eventos de partido en vivo')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT r.id, p.id FROM "roles" r, "permissions" p WHERE r.name = 'SUPERADMIN'
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT r.id, p.id FROM "roles" r, "permissions" p
        WHERE r.name = 'ORGANIZER' AND p.name IN ('create_tournament', 'report_match')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar tablas en orden inverso (hijos primero para respetar FKs)
    await queryRunner.query(`DROP TABLE IF EXISTS "security_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "countries"`);

    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_update_updated_at()`);

    // ENUMs (después de las tablas que los usan)
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_event_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gender_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_status"`);
  }
}
