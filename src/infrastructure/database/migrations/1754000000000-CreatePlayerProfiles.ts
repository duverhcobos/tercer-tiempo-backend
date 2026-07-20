import { MigrationInterface, QueryRunner } from 'typeorm';

// ╔═════════════════════════════════════════════════════╗
// ║  FASE 5 — EXTENSIÓN DEPORTIVA (PERFILES JUGADOR)   ║
// ╠═════════════════════════════════════════════════════╣
// ║  Funcionalidad habilitada:                          ║
// ║    ✓ Perfil deportivo vinculado al usuario          ║
// ║    ✓ Apodo, posición preferida, peso, altura        ║
// ║    ✓ Preferencia de nombre a mostrar                ║
// ║    ✓ Soft delete (deleted_at)                       ║
// ║                                                     ║
// ║  Dependencia: Fase 1 debe estar ejecutada.          ║
// ║  Crea: ENUM display_name_pref                       ║
// ║        tabla player_profiles                        ║
// ║        trigger trg_player_profiles_updated_at       ║
// ╚═════════════════════════════════════════════════════╝

export class CreatePlayerProfiles1754000000000 implements MigrationInterface {
  name = 'CreatePlayerProfiles1754000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Nuevo ENUM: display_name_pref ─────────────────────────
    // Controla qué nombre se muestra públicamente en el perfil.
    await queryRunner.query(
      `CREATE TYPE "display_name_pref" AS ENUM('username', 'full_name', 'nickname')`,
    );

    // ── Nueva tabla: player_profiles ──────────────────────────
    // Separada de users: un Organizador o Árbitro puro no la necesita.
    // Se crea bajo demanda cuando el usuario se inscribe como jugador.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "player_profiles" (
        "user_id"                 UUID              PRIMARY KEY
                                                    REFERENCES "users"("id")
                                                    ON DELETE CASCADE,
        "nickname"                VARCHAR(50),
        "display_name_preference" display_name_pref DEFAULT 'username',
        "preferred_position"      VARCHAR(50),
        "weight_kg"               DECIMAL(5,2),
        "height_cm"               DECIMAL(5,2),
        "created_at"              TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        "updated_at"              TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
        "deleted_at"              TIMESTAMP
      )
    `);

    // ── Trigger updated_at ────────────────────────────────────
    // Reutiliza la función fn_update_updated_at() creada en Fase 1.
    await queryRunner.query(`
      CREATE TRIGGER trg_player_profiles_updated_at
        BEFORE UPDATE ON "player_profiles"
        FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El trigger se elimina automáticamente al hacer DROP TABLE.
    await queryRunner.query(`DROP TABLE IF EXISTS "player_profiles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "display_name_pref"`);
  }
}
