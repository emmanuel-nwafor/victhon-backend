import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    JoinTable,
    ManyToMany, OneToMany, OneToOne,
} from "typeorm";
import { User } from "./User";
import { Professional } from "./Professional";
import { UserType } from "../types/constants";
import { ServiceEntity } from "./ServiceEntity";
import { Escrow } from "./Escrow";


export enum BookingStatus {
    PENDING = "pending",
    ACCEPTED = "accepted",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
    REJECTED = "rejected",
    REVIEW = "review",
    DISPUTED = "disputed",
    ON_THE_WAY = "on_the_way",
    AWAITING_COMMITMENT = "awaiting_commitment",
    CHATTING = "chatting"
}

export enum PaymentStatus {
    PENDING = "pending",
    PAID = "paid"
}

@Entity({ name: "bookings" })
export class Booking {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ nullable: true }) // because ON DELETE SET NULL
    userId: string;

    @ManyToOne(() => User, { onDelete: "SET NULL" })
    user: User;

    @Column()
    professionalId: string;

    @ManyToOne(() => Professional, { onDelete: "CASCADE" })
    professional: Professional;

    @ManyToMany(() => ServiceEntity, (v) => v.bookings)
    @JoinTable() // owner side adds join table
    services: ServiceEntity[];

    @Column({ type: 'varchar', length: 100, nullable: true })
    address: string;

    @Column({ name: 'start_datetime', type: 'datetime', precision: 3 })
    startDateTime!: Date;

    @Column({ name: 'end_datetime', type: 'datetime', precision: 3 })
    endDateTime!: Date;

    @Column({
        type: "enum",
        enum: BookingStatus,
        default: BookingStatus.PENDING,
    })
    status: BookingStatus;

    @OneToOne(() => Escrow, escrow => escrow.booking, {
        cascade: true,
        eager: true,
    })
    @JoinColumn() // 👈 REQUIRED on owning side
    escrow: Escrow;

    @Column({
        type: "enum",
        enum: UserType,
        nullable: true
    })
    cancelledBy: UserType;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    commitmentFee: number;

    @Column({ default: false })
    isChatUnlocked: boolean;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}