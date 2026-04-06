import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { AdminPermission } from "../types/constants";

@Entity("admins")
export class Admin {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 100, unique: true })
    email: string;

    @Column({ type: "text", select: false })
    password: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    firstName: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    lastName: string;

    @Column({
        type: "jsonb",
        default: [],
    })
    permissions: AdminPermission[];

    @Column({
        type: "varchar",
        length: 50,
        default: "admin",
    })
    role: string;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
