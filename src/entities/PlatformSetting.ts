import "reflect-metadata";
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";

@Entity("platform_settings")
export class PlatformSetting {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
    platformFeePercentage: number;
    
    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    fixedFee: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 2000 })
    commitmentFee: number;

    @Column({ type: "int", default: 48 })
    autoRefundHours: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
