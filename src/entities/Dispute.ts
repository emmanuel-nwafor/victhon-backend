import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { Transaction } from "./Transaction";

export enum DisputeStatus {
    OPEN = "OPEN",
    WON = "WON",
    LOST = "LOST",
}

@Entity('disputes')
export class Dispute {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "enum", enum: DisputeStatus, default: DisputeStatus.OPEN })
    status: DisputeStatus;

    @Column({ type: "text" })
    reason: string;

    @Column({ type: "text", nullable: true })
    description: string;

    @Column({ nullable: true })
    raisedBy: string;

    @Column("simple-array", { nullable: true })
    evidenceUrls: string[];

    @ManyToOne(() => Transaction, (transaction) => transaction.disputes, { nullable: false })
    @JoinColumn()
    transaction: Transaction;

    @Column()
    transactionId: string;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    amount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

