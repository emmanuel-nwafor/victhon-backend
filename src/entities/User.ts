import "reflect-metadata"
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import ChatParticipant from "./ChatParticipant";
import { Review } from "./Review";
import { Transaction } from "./Transaction";
import { AuthProvider } from "../types/constants";
import { Setting } from "./SettingEntity";

export interface PhotoField {
    url: string;
    publicId: string;
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: 'varchar', length: 50, unique: true })
    email: string;

    @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
    phone: string;

    @Column({ type: 'text', select: false, nullable: true })
    password: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    firstName: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    lastName: string;

    @Column({ type: 'json', nullable: true })
    profilePicture?: PhotoField | null;

    @Column({
        type: "enum",
        enum: AuthProvider,
        default: AuthProvider.LOCAL,
    })
    authProvider: string;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({ type: 'boolean', default: false })
    isVerified: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    pushToken: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    currentDeviceId: string;

    @OneToMany(() => ChatParticipant, (chatParticipant) => chatParticipant.user)
    chatParticipants: ChatParticipant[];

    @OneToMany(() => Review, (review) => review.user)
    reviews: Review[];

    @OneToMany(() => Transaction, (transaction) => transaction.user)
    transactions: Transaction[];
 
    @OneToOne(() => Setting, (setting) => setting.user, {
        cascade: true,
        eager: false,
    })
    setting: Setting;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}