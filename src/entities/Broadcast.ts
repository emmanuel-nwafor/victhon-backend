import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
} from "typeorm";

export enum BroadcastType {
    PUSH = "push",
    EMAIL = "email",
}

@Entity("broadcasts")
export class Broadcast {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({
        type: "enum",
        enum: BroadcastType,
    })
    type: BroadcastType;

    @Column()
    targets: string; // e.g., "All Users", "Professionals", "Customers"

    @Column({ nullable: true })
    title!: string | null;

    @Column({ type: "text" })
    content: string;

    @CreateDateColumn()
    createdAt: Date;
}
