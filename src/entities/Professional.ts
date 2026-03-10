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
    PrimaryGeneratedColumn,
    OneToOne
} from 'typeorm';
import { Account } from "./Account";
import { ProfessionalSchedule } from "./ProfessionalSchedule";
import { RatingAggregate } from "./RatingAggregate";
import { Review } from "./Review";
import { Transaction } from "./Transaction";
import { Wallet } from "./Wallet";
import ChatParticipant from "./ChatParticipant";
import { Setting } from "./SettingEntity";

// import { AuthProvider } from "./User";

export enum AuthProvider {
    LOCAL = "local",
    GOOGLE = "google"
}

export interface PhotoField {
    url: string;
    publicId: string;
}

export interface Geometry {
    type: "Point"
    coordinates: [Number, Number]
}

@Entity('professionals')
export class Professional {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: 'varchar', length: 50, unique: true })
    email: string;

    @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
    phone: string;

    @Column({ type: 'text', select: false })
    password: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    firstName: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    lastName: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    country: string;

    @Column({ type: 'varchar', length: 80, nullable: true })
    state: string;

    @Column({ type: 'json', nullable: true })
    profilePicture?: PhotoField;

    @Column({ type: 'varchar', length: 100, nullable: true })
    bio: string;

    @Column({ type: "json", nullable: true })
    skills: string[];

    @Column({
        type: "enum",
        enum: AuthProvider,
        default: AuthProvider.LOCAL,
    })
    authProvider: string;

    @Column("geometry", {
        spatialFeatureType: "Point",
        srid: 4326
    })
    @Index({ spatial: true })
    location: Geometry

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({ type: 'boolean', default: false })
    isVerified: boolean;

    @Column({ type: 'boolean', default: true })
    availability: boolean;

    @Column({ type: 'varchar', length: 100, nullable: true })
    baseCity: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    currentAddress: string;

    @OneToMany(() => ProfessionalSchedule, schedule => schedule.professional, { cascade: true })
    schedules: ProfessionalSchedule[];

    // @OneToMany(() => Booking, booking => booking.professional, { cascade: true })
    // professionalBookings: Booking[];

    @OneToMany(() => Account, account => account.professional, { cascade: true })
    account: Account[];

    // @OneToMany(() => Package, v => v.professional, { cascade: true })
    // package: Package[];

    @OneToMany(() => Review, review => review.professional, { cascade: true })
    reviews: Review[];

    @OneToOne(() => RatingAggregate, agg => agg.professional, { cascade: true })
    ratingAggregate: RatingAggregate;

    @OneToOne(() => Wallet, wallet => wallet.professional, {
        cascade: true,
        eager: false,
    })
    wallet: Wallet;

    @OneToOne(() => Setting, setting => setting.professional, {
        cascade: true,
        eager: false,
    })
    setting: Setting;



    @OneToMany(() => Transaction, (transaction) => transaction.professional)
    transactions: Transaction[];

    @OneToMany(() => ChatParticipant, (chatParticipants) => chatParticipants.professional)
    chatParticipants: ChatParticipant[];

    // @OneToMany(() => Favorite, v => v.professional, { cascade: true })
    // favorites: Favorite[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
