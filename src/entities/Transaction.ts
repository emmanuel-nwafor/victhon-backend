import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";
import { Dispute } from "./Dispute";
import { Escrow } from "./Escrow";
import { Professional } from "./Professional";
import { User } from "./User";
import { Wallet } from "./Wallet";

export enum TransactionType {
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
  BOOKING_DEPOSIT = "booking_deposit",
  ESCROW_RELEASE = "escrow_release",
  REFUND = "refund",
  DISPUTE = "dispute",
}

export enum TransactionStatus {
  PENDING = "pending",
  SUCCESS = "success",
  FAILED = "failed",
  PROCESSING = "processing",
}

@Entity("transactions")
@Check(
  `(userId IS NOT NULL AND professionalId IS NULL) OR (userId IS NULL AND professionalId IS NOT NULL)`,
)
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  professionalId?: string;

  @ManyToOne(() => User, (user) => user.transactions, { nullable: true })
  user: User;

  @ManyToOne(() => Professional, (professional) => professional.transactions, {
    nullable: true,
  })
  professional: Professional;

  @Column({
    type: "enum",
    enum: TransactionType,
  })
  type: TransactionType;

  @Column("decimal", { precision: 12, scale: 2 })
  amount: number;

  @Index()
  @Column({
    type: "enum",
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @ManyToOne(() => Escrow, (escrow) => escrow.transactions, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn()
  escrow?: Escrow;

  @Column({ nullable: true })
  escrowId?: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn()
  wallet?: Wallet;

  @Column({ nullable: true })
  walletId?: string;

  @ManyToOne(() => Dispute, (dispute) => dispute.transaction, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn()
  disputes?: Dispute;

  @Column({ nullable: true })
  disputeId?: string;

  // Your internal unique reference (tx_ref), e.g. "booking_xxx_1234567890"
  // Used for refund matching and RabbitMQ event routing
  @Column({ nullable: true })
  reference: string;

  // Flutterwave's numeric transaction ID
  // Received as ?transaction_id= in the redirect URL and as data.id in webhooks
  // Required for: transaction verification, refunds, reconciliation
  @Column({ nullable: true })
  flwTransactionId?: string;

  // The Flutterwave hosted checkout URL returned on payment initialization
  // Frontend redirects the user to this URL to complete payment
  @Column({ nullable: true })
  paymentLink?: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
