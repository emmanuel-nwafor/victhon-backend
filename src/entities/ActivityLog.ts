import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { Admin } from "./Admin";

@Entity("activity_logs")
export class ActivityLog {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ nullable: true })
    adminId: string;

    @ManyToOne(() => Admin, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "adminId" })
    admin: Admin;

    @Column()
    action: string; // e.g., "BROADCAST_SENT", "USER_SUSPENDED", "SETTINGS_UPDATED"

    @Column({ type: "json", nullable: true })
    details: any;

    @Column({ nullable: true })
    ipAddress: string;

    @CreateDateColumn()
    createdAt: Date;
}
