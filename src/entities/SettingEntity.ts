import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Unique
} from "typeorm";
import { Professional } from "./Professional";
import { User } from "./User";

@Entity("settings")
@Unique(["professionalId"])
@Unique(["userId"])
export class Setting {
    @PrimaryGeneratedColumn("uuid")
    id: string;
 
    @Column({ nullable: true })
    professionalId: string;
 
    @Column({ nullable: true })
    userId: string;
 
    @OneToOne(() => Professional, (professional) => professional.setting, {
        onDelete: "CASCADE",
        nullable: true,
    })
    @JoinColumn()
    professional: Professional;
 
    @OneToOne(() => User, {
        onDelete: "CASCADE",
        nullable: true,
    })
    @JoinColumn()
    user: User;
 
    @Column("boolean", { default: true })
    bookingRequestsEnabled: boolean;
 
    @Column("boolean", { default: true })
    newMessagesEnabled: boolean;
 
    @Column("boolean", { default: true })
    paymentReceivedEnabled: boolean;
 
    @Column("boolean", { default: true })
    customerReviewsEnabled: boolean;
 
    @Column("boolean", { default: false })
    biometricsEnabled: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
