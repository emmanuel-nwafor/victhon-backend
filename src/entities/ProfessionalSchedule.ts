import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Professional } from './Professional';

export type DayOfWeek =
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday';

@Index(['professionalId', 'dayOfWeek'], { unique: true })
@Entity('professional_schedules')
export class ProfessionalSchedule {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: 'varchar', length: 255 })
    professionalId!: string;

    @ManyToOne(
        () => Professional,
        (professional) => professional.schedules,
        { onDelete: "CASCADE" }
    )
    @JoinColumn()
    professional: Professional;

    // --- Recurring weekly rule ---
    @Column({ type: 'enum', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] })
    dayOfWeek!: DayOfWeek;

    @Column({ type: 'time', precision: 3 })
    startTime!: string; // e.g., '09:00:00'

    @Column({ type: 'time', precision: 3 })
    endTime!: string;   // e.g., '17:00:00'

    // --- Optional: date range override (e.g. holiday closure) ---
    @Column({ type: 'date', nullable: true })
    validFrom?: string | null;

    @Column({ type: 'date', nullable: true })
    validUntil?: string | null;

    @Column({ default: true })
    isActive!: boolean;
}