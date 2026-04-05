import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    Index,
    Check,
} from "typeorm";
import { User } from "./User";
import { Professional } from "./Professional";
import {UserType} from "../types/constants";

export enum NotificationType {
    SYSTEM = "system",
    BOOKING = "booking",
    ACCEPTED_BOOKING = "acceptedBooking",
    REJECTED_BOOKING = "rejectedBooking",
    VIEW_PROFILE = "viewProfile",
    BOOKING_PAYMENT = "bookingPayment",
    ESCROW_RELEASE = "escrow_release",
    REVIEW_BOOKING= "review_booking",
    CANCEL_BOOKING = "cancelBooking",
    REFUNDED_BOOKING = "refundBooking",
    REFUND_FAILED = "refundFailed",
    DISPUTED = "disputed",
    NEW_REVIEW = "new_review",
    CHAT = "chat",
    ON_THE_WAY = "on_the_way",
    COMPLETED = "completed",
    WELCOME = "welcome",
}

export enum NotificationStatus {
    PENDING = "pending",
    SENT = "sent",
    FAILED = "failed",
}

export enum NotificationPriority {
    NORMAL = "normal",
    HIGH = "high",
    URGENT = "urgent",
}

@Entity("notifications")
@Check(`(userId IS NOT NULL AND professionalId IS NULL) OR (userId IS NULL AND professionalId IS NOT NULL)`)
export class Notification {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ nullable: true })
    userId?: string | null | undefined;

    @Column({ nullable: true })
    professionalId?: string | null | undefined;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @ManyToOne(() => Professional, { onDelete: "CASCADE" })
    professional: Professional;

    @Column({
        type: "enum",
        enum: UserType
    })
    userType: UserType;

    @Column({
        type: "enum",
        enum: NotificationType,
        default: NotificationType.SYSTEM,
    })
    type: NotificationType;

    @Column({ type: "json" })
    data: any;

    @Column({
        type: "enum",
        enum: NotificationStatus,
        default: NotificationStatus.PENDING,
    })
    @Index()
    status: NotificationStatus;

    @Column({ type: "boolean", default: false })
    @Index()
    isRead: boolean;

    @Column({ type: "timestamp", nullable: true })
    readAt: Date | null;

    @Column({
        type: "enum",
        enum: NotificationPriority,
        default: NotificationPriority.NORMAL,
    })
    priority: NotificationPriority;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}