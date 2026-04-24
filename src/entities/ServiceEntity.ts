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
    ManyToMany
} from 'typeorm';
import { Professional } from "./Professional";
import { Booking } from "./Booking";

export interface PhotoField {
    url: string;
    publicId: string;
}


@Entity('services')
export class ServiceEntity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: 'varchar', length: 50 })
    name: string;

    @Column({ type: 'varchar', length: 80 })
    category: string;

    @Column({ type: 'text' , nullable: true})
    description: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    hourlyPrice: number;

    @Column({ type: 'varchar', length: 100, nullable: true })
    address: string;

    @Column({ type: 'boolean' })
    remoteLocationService: boolean;

    @Column({ type: 'boolean' })
    onsiteLocationService: boolean;

    @Column({ type: 'boolean' })
    storeLocationService: boolean;

    @Column({ type: 'json', nullable: true })
    images?: PhotoField[];

    @Column({ type: 'boolean', default: false })
    isNegotiable: boolean;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column()
    professionalId: string;

    @ManyToOne(() => Professional, { onDelete: "CASCADE" })
    @JoinColumn()
    professional: Professional;

    @ManyToMany(() => Booking, (booking) => booking.services)
    bookings: Booking[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
