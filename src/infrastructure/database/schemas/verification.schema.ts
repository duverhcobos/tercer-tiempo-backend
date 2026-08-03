import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('verifications')
export class VerificationSchema {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId!: string;

    @Column({ type: 'varchar', length: 50 })
    type!: string;

    @Column({ type: 'varchar', length: 255 })
    token!: string;

    @Column({ name: 'expires_at', type: 'timestamp' })
    expiresAt!: Date;

    @Column({ name: 'used_at', type: 'timestamp', nullable: true })
    usedAt!: Date | null;

    @Column({ type: 'smallint', default: 0 })
    attempts!: number;

    @Column({ name: 'max_attempts', type: 'smallint', default: 5 })
    maxAttempts!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}