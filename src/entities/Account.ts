import "reflect-metadata"
import {
    Entity,
    PrimaryColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    ManyToOne,
    Index,
    Unique,
    JoinColumn,
    PrimaryGeneratedColumn
} from 'typeorm';
import { Professional } from "./Professional";

@Entity('accounts')
export class Account {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: 'varchar', length: 50 })
    name: string;

    @Column({ type: 'varchar', length: 20 })
    accountNumber: string;

    @Column({ type: 'text' })
    bankName: string;

    @Column({ type: 'text' })
    bankCode: string;

    @Column({ type: 'boolean', default: false })
    isLocked: boolean;
 
    @Column()
    professionalId: string;

    @ManyToOne(() => Professional, { onDelete: "CASCADE" })
    @JoinColumn()
    professional: Professional;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
