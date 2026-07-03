import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class UserSchema {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ unique: true })
    email!: string;

    @Column({ name: 'password_hash', nullable: true, type: 'varchar' })
    passwordHash!: string | null;

    @Column({ name: 'phone_number', nullable: true, length: 20 })
    phoneNumber!: string;

    @Column({ name: 'sync_id', type: 'uuid', nullable: true, unique: true })
    syncId!: string;

    @Column({ name: 'google_id', nullable: true, unique: true, type: 'varchar' })
    googleId!: string | null;

    @Column({ name: 'avatar_url', nullable: true, type: 'text' })
    avatarUrl!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
