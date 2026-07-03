import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleAuthToUsers1751000000000 implements MigrationInterface {
    name = 'AddGoogleAuthToUsers1751000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Hacer password_hash nullable (usuarios que solo usan Google no tienen contraseña)
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "password_hash" DROP NOT NULL
        `);

        // Agregar columna google_id si no existe
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "google_id" VARCHAR(255) NULL UNIQUE
        `);

        // Agregar columna avatar_url si no existe
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "avatar_url" TEXT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_id"`);
        await queryRunner.query(`
            ALTER TABLE "users"
            ALTER COLUMN "password_hash" SET NOT NULL
        `);
    }
}
