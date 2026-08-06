import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('user_profiles')
export class UserProfileSchema {
    @PrimaryColumn({ type: 'uuid', name: 'user_id' })
    userId!: string;

    @Column({ name: 'first_name_1', length: 50 })
    firstName1!: string;

    @Column({ name: 'first_name_2', length: 50, nullable: true })
    firstName2!: string | null;

    @Column({ name: 'last_name_1', length: 50 })
    lastName1!: string;

    @Column({ name: 'last_name_2', length: 50, nullable: true })
    lastName2!: string | null;

    @Column({ name: 'avatar_file_id', length: 255, nullable: true })
    avatarFileId!: string | null;

    @Column({ name: 'birth_date', type: 'date' })
    birthDate!: string; // TypeORM retorna DATE como string en PostgreSQL

    @Column({ type: 'varchar', length: 10 })
    gender!: string;

    @Column({ name: 'country_id', length: 2, nullable: true })
    countryId!: string | null;

    @Column({ length: 50, default: 'UTC' })
    timezone!: string;

    @Column({ length: 10, default: 'es' })
    locale!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
    deletedAt!: Date | null;
}