-- =====================================================
-- ESQUEMA DE AUTENTICACIÓN — SCRIPT INCREMENTAL v3.0
-- =====================================================
-- Cada FASE habilita una funcionalidad nueva.
-- Ejecutar en orden: primero Fase 1, luego Fase 2, etc.
-- Cada fase solo crea o modifica lo estrictamente necesario.
--
-- FASE 1 │ Autenticación por email/password
-- FASE 2 │ Autenticación social (Google, Apple, OAuth…)
-- FASE 3 │ Autenticación por teléfono / SMS
-- FASE 4 │ Autenticación de dos factores (2FA / TOTP)
-- FASE 5 │ Extensión deportiva (perfiles de jugador)
--
-- DIAGRAMA FINAL (tras todas las fases):
--
--   countries ──────────────────── user_profiles
--                                       │
--   roles ── role_permissions ── permissions
--     │
--     └── user_roles
--              │
--              ↓
--            users
--              │
--              ├── user_profiles           (FASE 1)
--              ├── user_sessions           (FASE 1)
--              ├── verifications           (FASE 1)
--              ├── security_audit_logs     (FASE 1)
--              ├── user_social_identities  (FASE 2)
--              └── player_profiles         (FASE 5)
--
-- =====================================================


CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ╔═════════════════════════════════════════════════════╗
-- ║  FASE 1 — AUTENTICACIÓN POR EMAIL / PASSWORD        ║
-- ╠═════════════════════════════════════════════════════╣
-- ║  Funcionalidad habilitada:                          ║
-- ║    ✓ Registro con email + contraseña                ║
-- ║    ✓ Inicio de sesión                               ║
-- ║    ✓ Verificación de email (OTP)                    ║
-- ║    ✓ Recuperación de contraseña                     ║
-- ║    ✓ Gestión de sesiones multi-dispositivo          ║
-- ║    ✓ Roles y permisos (RBAC)                        ║
-- ║    ✓ Auditoría de seguridad básica                  ║
-- ╚═════════════════════════════════════════════════════╝

-- ── ENUMs de Fase 1 ──────────────────────────────────

CREATE TYPE user_status AS ENUM (
    'pending_verification',
    'active',
    'suspended',
    'banned'
);

CREATE TYPE gender_type AS ENUM ('M', 'F', 'other');

-- Solo los tipos de verificación necesarios en esta fase.
-- Se ampliarán en Fase 2 (change_email) y Fase 3 (phone_verification).
CREATE TYPE verification_type AS ENUM (
    'email_verification',
    'password_reset'
);

-- Solo los eventos de auditoría de esta fase.
-- Se ampliarán al agregar OAuth (Fase 2) y 2FA (Fase 4).
CREATE TYPE audit_event_type AS ENUM (
    'login_success',
    'login_failed',
    'password_changed',
    'password_reset_requested',
    'account_locked',
    'account_suspended',
    'token_revoked'
);

-- ── Función trigger reutilizable ──────────────────────

CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Catálogo de países ────────────────────────────────

CREATE TABLE IF NOT EXISTS countries (
    code         VARCHAR(2)   PRIMARY KEY,   -- ISO 3166-1 alfa-2
    name         VARCHAR(100) NOT NULL,
    phone_prefix VARCHAR(5),                 -- '+57', '+1', '+34'
    currency     VARCHAR(3),                 -- ISO 4217: 'COP', 'USD'
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ── Tabla: users (solo autenticación) ────────────────
-- En esta fase email y password_hash son obligatorios.
-- En Fase 2 (OAuth) password_hash pasará a ser opcional.

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL    PRIMARY KEY,
    sync_id         UUID         DEFAULT uuid_generate_v4() UNIQUE,
    email           VARCHAR(255) NOT NULL,
    username        VARCHAR(50)  NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,    -- obligatorio en auth local
    status          user_status  DEFAULT 'pending_verification',
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email_lower    ON users(LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_username_lower ON users(LOWER(username));
CREATE        INDEX IF NOT EXISTS idx_users_status          ON users(status);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ── Tabla: user_profiles (datos personales) ──────────
-- Separado de users para que la tabla de auth sea mínima
-- y los datos del perfil puedan evolucionar libremente.

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        BIGINT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name_1   VARCHAR(50)   NOT NULL,
    first_name_2   VARCHAR(50),
    last_name_1    VARCHAR(50)   NOT NULL,
    last_name_2    VARCHAR(50),
    -- Referencia al storage (S3/GCS). La URL se resuelve en el servicio.
    avatar_file_id VARCHAR(255),
    birth_date     DATE          NOT NULL,
    gender         gender_type   NOT NULL,
    country_id     VARCHAR(2)    REFERENCES countries(code) ON DELETE SET NULL,
    timezone       VARCHAR(50)   DEFAULT 'UTC',
    locale         VARCHAR(10)   DEFAULT 'es',
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP,

    -- Validación básica de identificadores IANA (America/Bogota, UTC, GMT…)
    CONSTRAINT chk_timezone_iana
        CHECK (timezone ~ '^(UTC|GMT|[A-Za-z]+/[A-Za-z0-9_+\-]+)$')
);

CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ── Tabla: user_sessions (refresh tokens) ────────────
-- Se almacena SHA-256(token_original) en hex (CHAR 64).
-- El token en texto plano NUNCA se persiste en la BD.

CREATE TABLE IF NOT EXISTS user_sessions (
    id                 BIGSERIAL  PRIMARY KEY,
    user_id            BIGINT     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash CHAR(64)   UNIQUE NOT NULL,  -- HEX de SHA-256(token)
    device_id          VARCHAR(255),
    device_name        VARCHAR(255),
    ip_address         INET,
    user_agent         TEXT,
    is_revoked         BOOLEAN    DEFAULT false,
    expires_at         TIMESTAMP  NOT NULL,
    created_at         TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP  DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user       ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at) WHERE is_revoked = false;

CREATE TRIGGER trg_user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ── Tabla: verifications (OTP / reset) ───────────────

CREATE TABLE IF NOT EXISTS verifications (
    id           BIGSERIAL          PRIMARY KEY,
    user_id      BIGINT             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         verification_type  NOT NULL,
    token        VARCHAR(255)       NOT NULL,
    expires_at   TIMESTAMP          NOT NULL,
    used_at      TIMESTAMP,
    attempts     SMALLINT           DEFAULT 0 NOT NULL,
    max_attempts SMALLINT           DEFAULT 5 NOT NULL,
    created_at   TIMESTAMP          DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_attempts_not_exceeded CHECK (attempts <= max_attempts)
);

CREATE INDEX IF NOT EXISTS idx_verifications_token      ON verifications(token);
CREATE INDEX IF NOT EXISTS idx_verifications_expires_at ON verifications(expires_at) WHERE used_at IS NULL;

-- ── Tablas RBAC ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(50)  UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INT NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    INT    NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

-- ── Tabla: security_audit_logs ────────────────────────
-- Inmutable: sin updated_at ni deleted_at intencionalmente.

CREATE TABLE IF NOT EXISTS security_audit_logs (
    id          BIGSERIAL        PRIMARY KEY,
    user_id     BIGINT           REFERENCES users(id) ON DELETE SET NULL,
    event_type  audit_event_type NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    metadata    JSONB,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user    ON security_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event   ON security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_metadata_gin ON security_audit_logs USING GIN(metadata);

-- ── Seeds Fase 1 ──────────────────────────────────────

INSERT INTO countries (code, name, phone_prefix, currency) VALUES
    ('CO', 'Colombia',       '+57',  'COP'),
    ('US', 'United States',  '+1',   'USD'),
    ('AR', 'Argentina',      '+54',  'ARS'),
    ('MX', 'México',         '+52',  'MXN'),
    ('ES', 'España',         '+34',  'EUR'),
    ('VE', 'Venezuela',      '+58',  'VES'),
    ('CL', 'Chile',          '+56',  'CLP'),
    ('PE', 'Perú',           '+51',  'PEN')
ON CONFLICT DO NOTHING;

INSERT INTO roles (name, description) VALUES
    ('SUPERADMIN', 'Administrador global del sistema'),
    ('ORGANIZER',  'Dueño y gestor de torneos barriales'),
    ('REFEREE',    'Árbitro oficial para dirigir partidos'),
    ('PLAYER',     'Jugador inscrito al menos en un equipo'),
    ('SPECTATOR',  'Usuario que solo consume resultados en vivo')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (name, description) VALUES
    ('manage_users',      'Gestionar, banear o editar usuarios'),
    ('create_tournament', 'Abrir y configurar nuevos torneos'),
    ('report_match',      'Reportar eventos de partido en vivo')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'SUPERADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'ORGANIZER'
      AND p.name IN ('create_tournament', 'report_match')
ON CONFLICT DO NOTHING;


-- ╔═════════════════════════════════════════════════════╗
-- ║  FASE 2 — AUTENTICACIÓN SOCIAL (GOOGLE, APPLE…)    ║
-- ╠═════════════════════════════════════════════════════╣
-- ║  Funcionalidad habilitada:                          ║
-- ║    ✓ Login con Google / Apple / Facebook / GitHub   ║
-- ║    ✓ Vinculación de múltiples proveedores           ║
-- ║    ✓ Desvinculación de proveedor                    ║
-- ║    ✓ Registro sin contraseña (OAuth-only accounts)  ║
-- ╚═════════════════════════════════════════════════════╝

-- ── Nuevo ENUM ────────────────────────────────────────

CREATE TYPE oauth_provider AS ENUM (
    'google',
    'apple',
    'facebook',
    'github',
    'microsoft'
);

-- ── Extensión de ENUMs existentes ────────────────────
-- NOTA: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro
-- de un bloque de transacción. Ejecutar estas sentencias
-- de forma independiente si se usa BEGIN/COMMIT explícito.

ALTER TYPE verification_type ADD VALUE IF NOT EXISTS 'change_email';
ALTER TYPE audit_event_type  ADD VALUE IF NOT EXISTS 'oauth_linked';
ALTER TYPE audit_event_type  ADD VALUE IF NOT EXISTS 'oauth_unlinked';

-- ── Cambio en users: password_hash ahora es opcional ─
-- Los usuarios OAuth no tienen contraseña local.

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

-- ── Nueva tabla: user_social_identities ──────────────

CREATE TABLE IF NOT EXISTS user_social_identities (
    id          BIGSERIAL      PRIMARY KEY,
    user_id     BIGINT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider    oauth_provider NOT NULL,
    provider_id VARCHAR(255)   NOT NULL,   -- ID devuelto por el proveedor
    created_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP,

    UNIQUE(provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_social_identities_user ON user_social_identities(user_id);


-- ╔═════════════════════════════════════════════════════╗
-- ║  FASE 3 — AUTENTICACIÓN POR TELÉFONO / SMS         ║
-- ╠═════════════════════════════════════════════════════╣
-- ║  Funcionalidad habilitada:                          ║
-- ║    ✓ Registro/login con número de teléfono          ║
-- ║    ✓ Verificación de teléfono por OTP SMS           ║
-- ║    ✓ Formato E.164 obligatorio (+573001112233)      ║
-- ╚═════════════════════════════════════════════════════╝

-- ── Extensión de ENUMs existentes ────────────────────

ALTER TYPE verification_type ADD VALUE IF NOT EXISTS 'phone_verification';

-- ── Nuevos campos en users ────────────────────────────

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
    ADD CONSTRAINT chk_phone_e164
        CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9]\d{6,14}$');

CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_phone
    ON users(phone_number) WHERE phone_number IS NOT NULL;


-- ╔═════════════════════════════════════════════════════╗
-- ║  FASE 4 — AUTENTICACIÓN DE DOS FACTORES (2FA/TOTP) ║
-- ╠═════════════════════════════════════════════════════╣
-- ║  Funcionalidad habilitada:                          ║
-- ║    ✓ 2FA con app TOTP (Google Authenticator, etc.)  ║
-- ║    ✓ Activación y desactivación de 2FA              ║
-- ║    ✓ Registro de eventos 2FA en auditoría           ║
-- ╚═════════════════════════════════════════════════════╝

-- ── Extensión de ENUMs existentes ────────────────────
-- Nota: en PostgreSQL los labels de ENUM no pueden empezar
-- con un dígito, por eso se usa 'two_fa_' en lugar de '2fa_'.

ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'two_fa_enabled';
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'two_fa_disabled';

-- ── Nuevos campos en users ────────────────────────────

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_two_factor_enabled BOOLEAN      DEFAULT false,
    ADD COLUMN IF NOT EXISTS two_factor_secret     VARCHAR(255);  -- Secreto TOTP (cifrado a nivel de app)


-- ╔═════════════════════════════════════════════════════╗
-- ║  FASE 5 — EXTENSIÓN DEPORTIVA (PERFILES JUGADOR)   ║
-- ╠═════════════════════════════════════════════════════╣
-- ║  Funcionalidad habilitada:                          ║
-- ║    ✓ Perfil deportivo vinculado al usuario          ║
-- ║    ✓ Apodo, posición, peso, altura                  ║
-- ║    ✓ Preferencia de nombre a mostrar                ║
-- ╚═════════════════════════════════════════════════════╝

-- ── Nuevo ENUM ────────────────────────────────────────

CREATE TYPE display_name_pref AS ENUM ('username', 'full_name', 'nickname');

-- ── Nueva tabla: player_profiles ─────────────────────
-- Separada de users: un Organizador puro no la necesita.

CREATE TABLE IF NOT EXISTS player_profiles (
    user_id                 BIGINT            PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    nickname                VARCHAR(50),
    display_name_preference display_name_pref DEFAULT 'username',
    preferred_position      VARCHAR(50),
    weight_kg               DECIMAL(5,2),
    height_cm               DECIMAL(5,2),
    created_at              TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
    deleted_at              TIMESTAMP
);

CREATE TRIGGER trg_player_profiles_updated_at
    BEFORE UPDATE ON player_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
