import axios from "axios";
import { In } from "typeorm";
import env, { EnvKey } from "../config/env";
import logger from "../config/logger";
import { AppDataSource } from "../data-source";
import { Account } from "../entities/Account";
import { Booking, BookingStatus } from "../entities/Booking";
import { Dispute } from "../entities/Dispute";
import { Escrow, EscrowStatus, RefundStatus } from "../entities/Escrow";
import { NotificationType } from "../entities/Notification";
import { PlatformSetting } from "../entities/PlatformSetting";
import { Professional } from "../entities/Professional";
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../entities/Transaction";
import { Wallet } from "../entities/Wallet";
import { QueueEvents, QueueNames, UserType } from "../types/constants";
import notify from "./notify";
import { RabbitMQ } from "./RabbitMQ";
import BaseService from "./Service";

// ─────────────────────────────────────────────────────────────────────────────
// Flutterwave v3 API base URL
// Docs: https://developer.flutterwave.com/docs
// ─────────────────────────────────────────────────────────────────────────────
const FLW_BASE_URL = "https://api.flutterwave.com/v3";

export default class Payment extends BaseService {
  private readonly bookingRepo = AppDataSource.getRepository(Booking);
  private readonly transactionRepo = AppDataSource.getRepository(Transaction);
  private readonly walletRepo = AppDataSource.getRepository(Wallet);
  private readonly escrowRepo = AppDataSource.getRepository(Escrow);
  private readonly disputeRepo = AppDataSource.getRepository(Dispute);
  private readonly proRepo = AppDataSource.getRepository(Professional);
  private readonly accountRepo = AppDataSource.getRepository(Account);
  private readonly platformSettingsRepo = AppDataSource.getRepository(PlatformSetting);

  private readonly FLW_SECRET_KEY = env(EnvKey.FLW_SECRET_KEY)!;

  private readonly FLW_SECRET_HASH = env(EnvKey.FLW_SECRET_HASH)!;

  private readonly FLW_REDIRECT_URL = env(EnvKey.FLW_REDIRECT_URL)!;

  private get flwClient() {
    return axios.create({
      baseURL: FLW_BASE_URL,
      headers: {
        Authorization: `Bearer ${this.FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });
  }

  public async initializeCommitmentPayment(bookingId: string, userId: string) {
    try {
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingId, userId },
        relations: ["user", "professional.wallet"],
      });

      if (!booking) return this.responseData(404, true, "Booking not found");
      if (booking.isChatUnlocked) return this.responseData(400, true, "Chat is already unlocked for this booking");

      const amount = Number(booking.commitmentFee);
      if (amount <= 0) return this.responseData(400, true, "Invalid commitment fee amount");

      const tx_ref = `commitment_${booking.id}_${Date.now()}`;
      const transaction = this.transactionRepo.create({
        userId,
        type: TransactionType.COMMITMENT_FEE,
        amount,
        status: TransactionStatus.PENDING,
        reference: tx_ref,
      });
      await this.transactionRepo.save(transaction);

      const response = await this.flwClient.post("/payments", {
        tx_ref,
        amount,
        currency: "NGN",
        redirect_url: this.FLW_REDIRECT_URL,
        customer: {
          email: booking.user.email,
          name: `${booking.user.firstName} ${booking.user.lastName}`,
        },
        meta: {
          type: TransactionType.COMMITMENT_FEE,
          transactionId: transaction.id,
          bookingId: booking.id,
          userId,
        },
        customizations: {
          title: "Booking Commitment Fee",
          description: `Unlock chat for booking #${bookingId}`,
        },
      });

      if (response.data?.status === "success") {
        return this.responseData(200, false, "Commitment fee payment initiated", {
          payment_link: response.data.data.link,
          tx_ref,
        });
      }
      return this.responseData(500, true, "Payment initialization failed");
    } catch (error) {
      return this.handleTypeormError(error);
    }
  }

  public async initializeBookingPayment(bookingId: string, userId: string) {
    try {
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingId, userId },
        relations: ["escrow", "user", "professional.wallet"],
      });

      if (!booking)
        return this.responseData(404, true, "Booking was not found");
      if (booking.escrow.status === EscrowStatus.PAID)
        return this.responseData(
          400,
          true,
          "This booking has already been paid",
        );
      if (![EscrowStatus.PENDING].includes(booking.escrow.status))
        return this.responseData(400, true, "Cannot pay for this booking");

      let wallet = booking.professional.wallet;
      if (!wallet) {
        wallet = await this.walletRepo.save(
          this.walletRepo.create({
            professionalId: booking.professionalId,
            balance: 0,
            pendingAmount: 0,
            totalBalance: 0,
          }),
        );
      }

      const existingTx = await this.transactionRepo.findOne({
        where: {
          escrowId: booking.escrow.id,
          type: TransactionType.BOOKING_DEPOSIT,
          status: TransactionStatus.PENDING,
        },
      });

      if (existingTx) {
        await this.transactionRepo.delete(existingTx.id);
      }

      const tx_ref = `booking_${booking.id}_${Date.now()}`;

      // Calculate balance to pay
      const amountToPay = booking.isChatUnlocked 
        ? Number(booking.amount) - Number(booking.commitmentFee)
        : Number(booking.amount);

      const transaction = this.transactionRepo.create({
        userId,
        type: TransactionType.BOOKING_DEPOSIT,
        amount: amountToPay,
        escrowId: booking.escrow.id,
        status: TransactionStatus.FAILED,
        reference: tx_ref,
        walletId: wallet.id,
      });
      await this.transactionRepo.save(transaction);

      const response = await this.flwClient.post("/payments", {
        tx_ref,
        amount: Number(booking.escrow.amount),
        currency: "NGN",
        redirect_url: this.FLW_REDIRECT_URL,
        customer: {
          email: booking.user.email,
          name: `${booking.user.firstName} ${booking.user.lastName}`,
          phonenumber: booking.user.phone ?? "",
        },
        meta: {
          type: TransactionType.BOOKING_DEPOSIT,
          transactionId: transaction.id,
          userId,
          escrowId: booking.escrow.id,
        },
        customizations: {
          title: "Booking Payment",
          description: `Payment for booking #${bookingId}`,
        },
      });

      if (response.data?.status === "success") {
        const payment_link: string = response.data.data.link;

        transaction.status = TransactionStatus.PENDING;
        await this.transactionRepo.save(transaction);

        return this.responseData(
          200,
          false,
          "Payment was initiated successfully",
          {
            payment_link,
            tx_ref,
          },
        );
      }

      return this.responseData(500, true, "Payment initialization failed");
    } catch (error) {
      console.error(error);
      return this.handleTypeormError(error);
    }
  }

  public async verifyFlwTransaction(flwTransactionId: string | number) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.flwClient.get(
          `/transactions/${flwTransactionId}/verify`,
        );
        const data = response.data?.data;

        // Normalize status to same shape the rest of the codebase expects
        const status =
          data?.status === "successful"
            ? "success"
            : data?.status === "failed"
              ? "failed"
              : "pending";

        return {
          status,
          tx_ref: data?.tx_ref,
          flw_ref: data?.flw_ref,
          amount: data?.amount,
          currency: data?.currency,
          metadata: data?.meta ?? {},
          raw: data,
        };
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to verify Flutterwave transaction after ${MAX_RETRIES} attempts`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    return {
      status: "error",
      error: "Unexpected error in verifyFlwTransaction",
    };
  }

  public async verifyFlwTransactionService(flwTransactionId: string) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.flwClient.get(
          `/transactions/${flwTransactionId}/verify`,
        );

        const data = response.data?.data;

        if (!data)
          return this.responseData(
            400,
            true,
            "Transaction not found on Flutterwave",
          );

        const isSuccessful = data.status === "successful";

        if (data.tx_ref) {
          // Save flwTransactionId on transaction record
          await this.transactionRepo.update(
            { reference: data.tx_ref },
            {
              flwTransactionId: String(flwTransactionId),
              status: isSuccessful
                ? TransactionStatus.SUCCESS
                : TransactionStatus.FAILED,
            },
          );

          // If successful, mark escrow as PAID directly (don't rely on webhook alone)
          if (isSuccessful) {
            const transaction = await this.transactionRepo.findOne({
              where: { reference: data.tx_ref },
              relations: [
                "escrow",
                "escrow.booking",
                "escrow.booking.professional",
                "escrow.booking.professional.wallet",
              ],
            });

            if (
              transaction?.escrow &&
              transaction.escrow.status !== EscrowStatus.PAID
            ) {
              await this.escrowRepo.update(
                { id: transaction.escrow.id },
                { status: EscrowStatus.PAID },
              );

              // Update wallet pending amount
              const wallet = transaction.escrow.booking?.professional?.wallet;
              if (wallet) {
                const newPendingAmount =
                  Number(wallet.pendingAmount) +
                  Number(transaction.escrow.amount);
                const newTotalBalance =
                  Number(wallet.balance) + newPendingAmount;
                await this.walletRepo.update(
                  { id: wallet.id },
                  {
                    pendingAmount: newPendingAmount,
                    totalBalance: newTotalBalance,
                  },
                );
              }
            }
          }
        }

        return this.responseData(
          200,
          false,
          "Successful verification",
          response.data,
        );
      } catch (error: any) {
        console.error(`Attempt ${attempt} failed:`, error);

        if (attempt === MAX_RETRIES) {
          const flwMessage = error?.response?.data?.message;
          if (flwMessage) {
            return this.responseData(400, true, flwMessage);
          }
          return this.responseData(500, true, "Failed to verify transaction. Please try again later.");
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    return this.responseData(
      500,
      true,
      "Unexpected error in verifyFlwTransactionService",
    );
  }

  public async verifyCommitmentPayment(bookingId: string) {
    try {
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingId },
        relations: ["user", "professional"]
      });

      if (!booking) return this.responseData(404, true, "Booking not found");
      if (booking.isChatUnlocked) return this.responseData(200, false, "Booking already unlocked", booking);

      // Search for any successful commitment transaction for this booking
      const tx = await this.transactionRepo.createQueryBuilder("tx")
        .where("tx.reference LIKE :ref", { ref: `commitment_${bookingId}%` })
        .andWhere("tx.status = :status", { status: TransactionStatus.SUCCESS })
        .getOne();

      if (tx) {
          logger.info(`[MANUAL_VERIFY] Found successful transaction ${tx.id} in DB. Unlocking booking ${bookingId}.`);
          booking.isChatUnlocked = true;
          booking.status = BookingStatus.SCHEDULED;
          await this.bookingRepo.save(booking);
          
          await RabbitMQ.publishToExchange(QueueNames.PAYMENT, QueueEvents.PAYMENT_COMMITMENT_SUCCESSFUL, {
              eventType: QueueEvents.PAYMENT_COMMITMENT_SUCCESSFUL,
              payload: {
                  bookingId: booking.id,
                  userId: booking.userId,
                  professionalId: booking.professionalId
              }
          });
          
          return this.responseData(200, false, "Booking unlocked successfully", booking);
      }

      // If not in our DB, we check with Flutterwave using the latest pending reference
      const pendingTx = await this.transactionRepo.createQueryBuilder("tx")
        .where("tx.reference LIKE :ref", { ref: `commitment_${bookingId}%` })
        .orderBy("tx.createdAt", "DESC")
        .getOne();

      if (!pendingTx) return this.responseData(404, true, "No payment records found for this booking");

      const flwResponse = await this.verifyFlwTransaction(pendingTx.reference);
      
      if (flwResponse.status === "success") {
          logger.info(`[MANUAL_VERIFY] Flutterwave confirmed success for ${pendingTx.reference}. Processing...`);
          await this.successfulCharge(flwResponse);
          const updatedBooking = await this.bookingRepo.findOne({ where: { id: bookingId } });
          return this.responseData(200, false, "Booking verified and unlocked", updatedBooking);
      }

      return this.responseData(400, true, "Payment not yet confirmed by Flutterwave", { flwStatus: flwResponse.status });
    } catch (error) {
      logger.error(`[MANUAL_VERIFY] Error verifying commitment for ${bookingId}:`, error);
      return this.handleTypeormError(error);
    }
  }

  public async reconcilePendingTransactions() {
    const BATCH_SIZE = 100;
    const TIMEOUT_MS = 30 * 60 * 1000;
    const MAX_BATCHES = 1000;
    const threshold = new Date(Date.now() - TIMEOUT_MS);
    let batches = 0;

    while (batches++ < MAX_BATCHES) {
      const transactions = await AppDataSource.transaction(async (manager) => {
        const txs = await manager
          .createQueryBuilder(Transaction, "tx")
          .where("tx.status = :status", { status: TransactionStatus.PENDING })
          .andWhere("tx.createdAt < :threshold", { threshold })
          .orderBy("tx.createdAt", "ASC")
          .limit(BATCH_SIZE)
          .setLock("pessimistic_write")
          .getMany();

        if (txs.length === 0) return [];

        await manager
          .createQueryBuilder()
          .update(Transaction)
          .set({ status: TransactionStatus.PROCESSING })
          .whereInIds(txs.map((t) => t.id))
          .execute();

        return txs;
      });

      if (transactions.length === 0) {
        logger.info("✅ No more pending transactions");
        break;
      }

      logger.info(`📦 Processing ${transactions.length} transactions`);

      for (const tx of transactions) {
        try {
          if (!tx.flwTransactionId) {
            await this.failTransaction(
              tx.id,
              "Missing Flutterwave transaction ID",
            );
            continue;
          }

          const flwTx = await this.verifyFlwTransaction(tx.flwTransactionId);

          if (flwTx.status === "success") {
            await RabbitMQ.publishToExchange(
              QueueNames.PAYMENT,
              QueueEvents.PAYMENT_CHARGE_SUCCESSFUL,
              {
                eventType: QueueEvents.PAYMENT_CHARGE_SUCCESSFUL,
                payload: { data: flwTx },
              },
            );
          } else if (flwTx.status === "failed") {
            await this.failTransaction(tx.id, "Flutterwave transaction failed");
          } else {
            await this.resetToPending(tx.id);
          }
        } catch (err) {
          logger.error(`❌ Error processing tx ${tx.id}`, err);
          await this.failTransaction(tx.id, "Error processing tx");
        }
      }
    }
  }

  public async failTransaction(txId: string, reason: string) {
    await AppDataSource.getRepository(Transaction).update(
      { id: txId },
      { status: TransactionStatus.FAILED },
    );
  }

  public async resetToPending(txId: string) {
    await AppDataSource.getRepository(Transaction).update(
      { id: txId },
      { status: TransactionStatus.PENDING },
    );
  }

  public async successfulCharge(eventData: any) {
    try {
      const { transactionId: metaTxId } = eventData.metadata ?? eventData.meta ?? {};
      const txRef = eventData.tx_ref || eventData.reference;
      
      logger.info(`[PAYMENT_WEBHOOK] Received webhook. metaTxId: ${metaTxId}, txRef: ${txRef}`);

      if (!metaTxId && !txRef) {
        logger.error("No transactionId or tx_ref in webhook data");
        return;
      }

      let eventToPublish = null;

      await AppDataSource.transaction(async (manager) => {
        // Step 1: Find the transaction without relations first to avoid join errors on null escrows
        let payment = null;
        if (metaTxId) {
            payment = await manager.findOne(Transaction, {
                where: { id: metaTxId },
                lock: { mode: "pessimistic_write" },
            });
        }
        
        if (!payment && txRef) {
            logger.info(`[PAYMENT_WEBHOOK] Falling back to searching by reference: ${txRef}`);
            payment = await manager.findOne(Transaction, {
                where: { reference: txRef },
                lock: { mode: "pessimistic_write" },
            });
        }

        if (!payment) {
            logger.error(`Payment not found for metaTxId: ${metaTxId} or txRef: ${txRef}`);
            throw new Error("Transaction not found");
        }

        // Step 2: Load specific relations for the transaction type to avoid crashing on null escrows
        if (payment.type === TransactionType.BOOKING_DEPOSIT) {
            payment = await manager.findOne(Transaction, {
                where: { id: payment.id },
                relations: ["escrow", "escrow.booking", "escrow.booking.professional", "escrow.booking.professional.wallet"]
            }) || payment;
        }

        if (!payment) {
          logger.error(`Payment not found for metaTxId: ${metaTxId} or txRef: ${txRef}`);
          throw new Error("Transaction not found");
        }
        
        const finalTxId = payment.id;

        if (payment.status === TransactionStatus.SUCCESS) {
          logger.info(`Payment already processed: ${finalTxId}`);
          return;
        }

        await manager.update(
          Transaction,
          { id: finalTxId },
          { status: TransactionStatus.SUCCESS },
        );

        if (payment.type === TransactionType.BOOKING_DEPOSIT) {
          const escrow = payment.escrow;
          if (!escrow) throw new Error("Escrow not found for transaction");

          if (escrow.status === EscrowStatus.PAID) {
            logger.info(
              `Escrow already PAID for transaction: ${finalTxId}`,
            );
            return;
          }

          await manager.update(
            Escrow,
            { id: escrow.id },
            { status: EscrowStatus.PAID },
          );

          const wallet = await manager.findOne(Wallet, {
            where: { professionalId: escrow.booking.professionalId },
            lock: { mode: "pessimistic_write" },
          });

          if (!wallet) throw new Error("Wallet not found");

          const settings = await manager.findOne(PlatformSetting, { where: {} });
          let netAmount = Number(escrow.amount);
          
          if (settings) {
            const feePercent = Number(settings.platformFeePercentage || 0);
            const fixedFee = Number(settings.fixedFee || 0);
            const deduction = (netAmount * feePercent / 100) + fixedFee;
            netAmount = Math.max(0, netAmount - deduction);
            logger.info(`Deducted platform fee: ${deduction} (Net: ${netAmount})`);
          }

          const newPendingAmount =
            Number(wallet.pendingAmount) + netAmount;
          const newTotalBalance = Number(wallet.balance) + newPendingAmount;

          await manager.update(
            Wallet,
            { id: wallet.id },
            {
              pendingAmount: newPendingAmount,
              totalBalance: newTotalBalance,
            },
          );

          eventToPublish = {
            queueName: QueueNames.PAYMENT,
            eventType: QueueEvents.PAYMENT_BOOK_SUCCESSFUL,
            payload: {
              transactionId: finalTxId,
              professionalId: escrow.booking.professionalId,
            },
          };
        } else if (payment.type === TransactionType.COMMITMENT_FEE) {
            // Robust bookingId extraction
            const bookingId = eventData.metadata?.bookingId || payment.reference?.split('_')[1];
            
            logger.info(`[PAYMENT_WEBHOOK] Processing Commitment Fee for booking: ${bookingId}`);

            if (!bookingId) {
                logger.error(`Invalid commitment fee reference: ${payment.reference}`);
                throw new Error("Invalid commitment fee reference");
            }

            const booking = await manager.findOne(Booking, { 
                where: { id: bookingId },
                relations: ["user", "professional"]
            });

            if (booking) {
                logger.info(`[PAYMENT_WEBHOOK] Found booking: ${booking.id}, status: ${booking.status}, chatUnlocked: ${booking.isChatUnlocked}`);
                
                // Transition to SCHEDULED regardless of current state if commitment paid
                if (!booking.isChatUnlocked) {
                    try {
                        booking.isChatUnlocked = true;
                        booking.status = BookingStatus.SCHEDULED;
                        await manager.save(booking);
                        logger.info(`[PAYMENT_WEBHOOK] Successfully updated booking ${booking.id} to SCHEDULED`);

                        eventToPublish = {
                            queueName: QueueNames.PAYMENT,
                            eventType: QueueEvents.PAYMENT_COMMITMENT_SUCCESSFUL,
                            payload: {
                                bookingId: booking.id,
                                userId: booking.userId,
                                professionalId: booking.professionalId
                            }
                        };
                    } catch (saveErr: any) {
                        logger.error(`[PAYMENT_WEBHOOK] Failed to save booking ${bookingId}: ${saveErr.message}`);
                        throw saveErr; // Rollback transaction
                    }
                } else {
                    logger.info(`[PAYMENT_WEBHOOK] Chat already unlocked for booking ${booking.id}`);
                }
            } else {
                logger.error(`[PAYMENT_WEBHOOK] Booking ${bookingId} not found for commitment fee`);
            }
        }

        logger.info(
          `🤑 Payment successfully processed for transaction: ${finalTxId}`,
        );
      });

      if (eventToPublish != null) {
        await RabbitMQ.publishToExchange(
          (eventToPublish as any).queueName,
          (eventToPublish as any).eventType,
          {
            eventType: (eventToPublish as any).eventType,
            payload: (eventToPublish as any).payload,
          },
        );
      }
    } catch (error) {
      logger.error(`Payment processing failed`, error);
      return this.handleTypeormError(error);
    }
  }

  public async dispute(bookingId: string, reason?: string, evidenceUrls?: string[]) {
    try {
      const result = await AppDataSource.transaction(async (manager) => {
        const transactionRepo = manager.getRepository(Transaction);
        const disputeRepo = manager.getRepository(Dispute);

        const transaction = await transactionRepo.findOne({
          where: {
            escrow: { booking: { id: bookingId } },
            status: TransactionStatus.SUCCESS,
            type: TransactionType.BOOKING_DEPOSIT
          },
          relations: ["escrow", "escrow.booking", "wallet"],
          lock: { mode: "pessimistic_write" },
        });

        if (!transaction) {
          logger.error(`Successful transaction not found for bookingId: ${bookingId}`);
          return;
        }

        const escrow = transaction.escrow;
        if (!escrow) {
          logger.error(`Escrow not found for transactionId: ${transaction.id}`);
          return;
        }
        if (escrow.status !== EscrowStatus.PAID) {
          logger.error(`Escrow was not PAID`);
          return;
        }

        const existingDispute = await transactionRepo.findOne({
          where: { escrowId: escrow.id, type: TransactionType.DISPUTE },
          lock: { mode: "pessimistic_read" },
        });
        if (existingDispute) {
          logger.warn(`Dispute already exists for escrow ${escrow.id}`);
          return;
        }

        const reference = `dispute_${transaction.reference}`;
        const disputeTx = transactionRepo.create({
          userId: transaction.userId!,
          escrowId: transaction.escrow!.id,
          amount: transaction.amount,
          type: TransactionType.DISPUTE,
          status: TransactionStatus.PENDING,
          reference,
        });

        const newDispute = disputeRepo.create({
          transaction: transaction,
          amount: transaction.amount,
          reason: reason || "Dispute initiated",
          evidenceUrls: evidenceUrls || [],
        });

        escrow.status = EscrowStatus.DISPUTED;

        const booking = escrow.booking;
        if (!booking) {
          logger.error(`Booking not found for escrow: ${escrow.id}`);
          return;
        }

        booking.status = BookingStatus.DISPUTED;

        await manager.save([
          transaction,
          disputeTx,
          escrow,
          booking,
          newDispute,
        ]);
        return booking;
      });

      if (result) {
        notify({
          userId: result.professionalId,
          userType: UserType.PROFESSIONAL,
          type: NotificationType.CANCEL_BOOKING,
          data: { ...result, professional: undefined },
        }).catch(err => console.error("[PAYMENT_FLOW] Failed to queue dispute notification:", err));
      } else {
        logger.error("Dispute transaction failed");
      }
    } catch (error) {
      console.error(error);
      return this.handleTypeormError(error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REFUND BOOKING
  //
  // Flutterwave: POST /v3/transactions/:transaction_id/refund { amount }
  //
  // Flutterwave refunds use the numeric transaction ID (data.id from the charge),
  // NOT the tx_ref string. We store this as flwTransactionId on the Transaction entity.
  // ─────────────────────────────────────────────────────────────
  public async refundBooking(bookingId: string, userId: string) {
    try {
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingId, userId },
        relations: ["escrow"],
      });

      if (!booking) return this.responseData(404, true, "Booking not found");
      if (booking.status == BookingStatus.COMPLETED)
        return this.responseData(
          400,
          true,
          "Refund not allowed, booking was completed.",
        );
      if (booking.escrow.status !== EscrowStatus.PAID)
        return this.responseData(400, true, "Refund not allowed");
      if (
        booking.escrow.refundStatus !== RefundStatus.NONE &&
        booking.escrow.refundStatus !== RefundStatus.FAILED
      )
        return this.responseData(
          400,
          true,
          "Refund not allowed, booking already refunded",
        );

      const paymentTx = await this.transactionRepo.findOne({
        where: {
          escrowId: booking.escrow.id,
          type: TransactionType.BOOKING_DEPOSIT,
          status: TransactionStatus.SUCCESS,
        },
      });

      if (!paymentTx)
        return this.responseData(404, true, "Original payment not found");
      if (!paymentTx.flwTransactionId)
        return this.responseData(
          400,
          true,
          "Missing Flutterwave transaction ID for refund",
        );

      // Idempotency guard
      const existingRefund = await this.transactionRepo.findOne({
        where: {
          escrowId: booking.escrow.id,
          type: TransactionType.REFUND,
          status: In([TransactionStatus.SUCCESS, TransactionStatus.PENDING]),
        },
      });
      if (existingRefund)
        return this.responseData(200, false, "Refund already initiated");

      // Create refund transaction record (FAILED until Flutterwave confirms)
      const refundTx = this.transactionRepo.create({
        userId,
        escrowId: booking.escrow.id,
        amount: paymentTx.amount,
        type: TransactionType.REFUND,
        status: TransactionStatus.FAILED,
        reference: paymentTx.reference,
      });
      await this.transactionRepo.save(refundTx);

      // POST /v3/transactions/:id/refund
      const response = await this.flwClient.post(
        `/transactions/${paymentTx.flwTransactionId}/refund`,
        { amount: Number(paymentTx.amount) },
      );

      if (response.data?.status === "success") {
        refundTx.status = TransactionStatus.PENDING;
        booking.status = BookingStatus.DISPUTED;

        await this.bookingRepo.save(booking);
        await this.transactionRepo.save(refundTx);

        notify({
          userId: booking.professionalId,
          userType: UserType.PROFESSIONAL,
          type: NotificationType.DISPUTED,
          data: { ...booking, professional: undefined },
        }).catch(err => console.error("[PAYMENT_FLOW] Failed to queue refund notification:", err));

        return this.responseData(
          200,
          false,
          "Refund was initiated successfully",
          response.data.data,
        );
      }

      return this.responseData(400, false, "Refund failed to initiate");
    } catch (error) {
      console.error(error);
      return this.handleTypeormError(error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REFUND SUCCESSFUL / FAILED (called by RabbitMQ consumer — unchanged)
  // ─────────────────────────────────────────────────────────────
  public async refundSuccessful(reference: string) {
    try {
      const result = await AppDataSource.transaction(async (manager) => {
        const refundTx = await manager.findOne(Transaction, {
          where: { reference, type: TransactionType.REFUND },
          relations: [
            "escrow",
            "escrow.booking",
            "escrow.booking.professional",
          ],
          lock: { mode: "pessimistic_write" },
        });

        if (!refundTx || refundTx.status === TransactionStatus.SUCCESS) return;

        const escrow = refundTx.escrow;
        if (!escrow) throw new Error("Escrow not found for refund transaction");
        if (escrow.refundStatus === RefundStatus.SUCCESS) {
          logger.info(`Escrow already refunded: ${escrow.id}`);
          return null;
        }
        if (escrow.status !== EscrowStatus.PAID)
          throw new Error("Escrow not in refundable state");

        const wallet = await manager.findOne(Wallet, {
          where: { professionalId: escrow.booking.professionalId },
          lock: { mode: "pessimistic_write" },
        });
        if (!wallet) throw new Error("Wallet not found");
        if (Number(wallet.pendingAmount) < Number(escrow.amount))
          throw new Error("Invalid wallet state");

        wallet.pendingAmount =
          Number(wallet.pendingAmount) - Number(escrow.amount);
        wallet.totalBalance =
          Number(wallet.balance) + Number(wallet.pendingAmount);
        escrow.refundStatus = RefundStatus.SUCCESS;
        escrow.status = EscrowStatus.CANCELLED;
        refundTx.status = TransactionStatus.SUCCESS;

        await manager.save([wallet, escrow, refundTx]);
        return refundTx;
      });

      if (result)
        logger.info(`💸 Refund completed for transaction: ${result.id}`);
      else
        logger.info(`💸 Refund record not updated for reference: ${reference}`);
    } catch (error) {
      console.error(error);
      this.handleTypeormError(error);
    }
  }

  public async refundFailed(reference: string) {
    try {
      const result = await AppDataSource.transaction(async (manager) => {
        const refundTx = await manager.findOne(Transaction, {
          where: { reference, type: TransactionType.REFUND },
          relations: ["escrow", "escrow.booking", "escrow.booking.user"],
          lock: { mode: "pessimistic_write" },
        });

        if (!refundTx || refundTx.status === TransactionStatus.SUCCESS) return;

        const escrow = refundTx.escrow;
        if (!escrow) throw new Error("Escrow not found");
        if (escrow.refundStatus === RefundStatus.SUCCESS) {
          logger.info(`Escrow already refunded: ${escrow.id}`);
          return null;
        }

        escrow.refundStatus = RefundStatus.FAILED;
        refundTx.status = TransactionStatus.FAILED;

        await manager.save([escrow, refundTx]);
        return refundTx;
      });

      if (result) {
        notify({
          userId: result.userId,
          userType: UserType.USER,
          type: NotificationType.REFUND_FAILED,
          data: result,
        }).catch(err => console.error("[PAYMENT_FLOW] Failed to queue refund-failed notification:", err));
        logger.info(`💸 Refund failed for transaction: ${result.id}`);
      }
    } catch (error) {
      console.error(error);
      this.handleTypeormError(error);
    }
  }

  public async webhook(payload: any, signature: any) {
    const signatureStr = String(signature || "");
    const expectedHash = String(this.FLW_SECRET_HASH || "");
    
    logger.info(`[PAYMENT_WEBHOOK] Verifying signature. Received: ${signatureStr.substring(0, 5)}..., Expected matches: ${signatureStr === expectedHash}`);

    if (!signature || signature !== this.FLW_SECRET_HASH) {
      logger.error(`[PAYMENT_WEBHOOK] Unauthorized. Received Signature does not match FLW_SECRET_HASH.`);
      return this.responseData(401, true, "Invalid signature");
    }

    const event = JSON.parse(payload.toString());
    const data = event.data;

    const queueName = QueueNames.PAYMENT;

    switch (event.event) {
      case "charge.completed": {
        if (data.status === "successful") {
          const eventType = QueueEvents.PAYMENT_CHARGE_SUCCESSFUL;
          await RabbitMQ.publishToExchange(queueName, eventType, {
            eventType,
            payload: { data },
          });
        } else {
          // Payment failed — log or handle as needed
          logger.warn(`Payment failed for tx_ref: ${data.tx_ref}`);
        }
        break;
      }

      case "transfer.completed": {
        if (data.status === "SUCCESSFUL") {
          logger.info(`Transfer successful — reference: ${data.reference}`);
        } else {
          logger.warn(`Transfer failed — reference: ${data.reference}`);
        }
        break;
      }

      default:
        logger.info(`Unhandled Flutterwave event: ${event.event}`);
    }

    return this.responseData(200, false, null);
  }

  public async getHasPin(userId: string) {
    try {
      const pro = await this.proRepo.createQueryBuilder("pro")
        .leftJoinAndSelect("pro.account", "account")
        .addSelect("pro.pin")
        .where("pro.id = :id", { id: userId })
        .getOne();

      const accountDetails = pro?.account?.[0] || null;
      return this.responseData(200, false, "Successfully checked PIN status", { hasPin: !!pro?.pin, account: accountDetails });
    } catch (error) {
      return this.handleTypeormError(error);
    }
  }

  public async setupPin(userId: string, pin: string) {
    try {
      if (!pin || pin.length < 4) return this.responseData(400, true, "PIN must be at least 4 characters");

      const Password = require("../utils/Password").default;
      const hashedPin = Password.hashPassword(pin, env(EnvKey.STORED_SALT)!);

      await this.proRepo.update({ id: userId }, { pin: hashedPin });
      return this.responseData(200, false, "PIN setup successfully");
    } catch (error) {
      return this.handleTypeormError(error);
    }
  }

  public async changePinAfterVerification(userId: string, email: string, pin: string) {
    try {
      if (!pin || pin.length < 4) return this.responseData(400, true, "PIN must be at least 4 characters");

      // Must have completed OTP verification first
      const OTPCache = require("../cache/otpCache").default;
      const { UserType } = require("../types/constants");
      const otpCache = new OTPCache();
      const verifiedResult = await otpCache.getPasswordResetVerified(email, UserType.PROFESSIONAL);
      if (verifiedResult.error || !verifiedResult.data?.verified) {
        return this.responseData(400, true, "PIN change not authorized. Please verify your OTP first.");
      }

      // Clear the verified flag so it can't be replayed
      await otpCache.deletePasswordResetVerified(email, UserType.PROFESSIONAL);

      const pro = await this.proRepo.findOneBy({ id: userId });
      if (!pro) return this.responseData(404, true, "Professional account not found");

      const Password = require("../utils/Password").default;
      const hashedPin = Password.hashPassword(pin, env(EnvKey.STORED_SALT)!);
      await this.proRepo.update({ id: userId }, { pin: hashedPin });

      return this.responseData(200, false, "Transaction PIN changed successfully");
    } catch (error) {
      return this.handleTypeormError(error);
    }
  }

  public async getBanks() {
    try {
      const response = await this.flwClient.get("/banks/NG");
      return this.responseData(200, false, "Banks retrieved", response.data?.data || []);
    } catch (error: any) {
      logger.error("Flutterwave API failed", error.response?.data || error.message);
      return this.responseData(500, true, "Failed to fetch banks");
    }
  }

  public async resolveAccount(accountNumber: string, bankCode: string) {
    try {
      const cleanAccountNumber = String(accountNumber || "").replace(/[^0-9]/g, '');
      const cleanBankCode = String(bankCode || "").replace(/[^0-9]/g, '');

      logger.info(`🔍 Flutterwave Resolve: "${cleanAccountNumber}" at bank code "${cleanBankCode}"`);

      const response = await this.flwClient.post("/accounts/resolve", {
        account_number: cleanAccountNumber,
        account_bank: cleanBankCode
      });
      return this.responseData(200, false, "Account resolved", response.data?.data);
    } catch (error: any) {
      const flwError = error.response?.data || error.message;
      logger.error("Flutterwave API failed", flwError);

      const errorMessage = typeof flwError === 'object' ? flwError.message : String(flwError);

      if (errorMessage?.toLowerCase().includes('only 044 is allowed')) {
        return this.responseData(400, true, "Flutterwave Test Mode only supports Access Bank (code: 044). Please verify you are using a correct Access Bank account.");
      }

      if (errorMessage?.toLowerCase().includes('must be numberic')) {
        return this.responseData(400, true, `Flutterwave requires numeric account details. Got: Account=${accountNumber}, Bank=${bankCode}`);
      }

      return this.responseData(400, true, "Could not verify account details. " + (errorMessage || ""));
    }
  }

  public async withdraw(userId: string, accountId: string | undefined, amount: number, pin: string, accountDetails?: any) {
    try {
      let bankCode, accountNumber, narration;

      const wallet = await this.walletRepo.findOne({
        where: { professionalId: userId }
      });
      if (!wallet) return this.responseData(404, true, "Wallet not found");

      if (wallet.balance < amount)
        return this.responseData(400, true, "Insufficient balance");
      if (amount < 100)
        return this.responseData(400, true, "Amount too low for withdrawal");

      const pro = await this.proRepo.createQueryBuilder("pro")
        .addSelect("pro.pin")
        .where("pro.id = :id", { id: userId })
        .getOne();

      if (!pro || !pro.pin) return this.responseData(400, true, "PIN not set up");

      const Password = require("../utils/Password").default;
      const isValid = Password.compare(pin, pro.pin, env(EnvKey.STORED_SALT)!);
      if (!isValid) return this.responseData(400, true, "Invalid PIN");

      const existingAccount = await this.accountRepo.findOne({
        where: { professionalId: userId, isLocked: true },
      }) || await this.accountRepo.findOne({
        where: { professionalId: userId },
        order: { createdAt: "ASC" }
      });

      let usedAccount: Account;

      if (existingAccount) {
        bankCode = existingAccount.bankCode;
        accountNumber = existingAccount.accountNumber;
        narration = `Withdrawal to ${existingAccount.name}`;
        usedAccount = existingAccount;
      } else {
        if (!accountDetails || !accountDetails.bankCode || !accountDetails.accountNumber) {
          return this.responseData(400, true, "Bank details are required to set up your first withdrawal account.");
        }

        const newAccount = this.accountRepo.create({
          professionalId: userId,
          name: accountDetails.accountName || "Professional",
          accountNumber: accountDetails.accountNumber,
          bankCode: accountDetails.bankCode,
          bankName: accountDetails.bankName || "Unknown Bank",
          isLocked: false // Will be locked after successful initiation
        });
        usedAccount = await this.accountRepo.save(newAccount);

        bankCode = usedAccount.bankCode;
        accountNumber = usedAccount.accountNumber;
        narration = `Withdrawal to ${usedAccount.name}`;
      }

      const reference = `wd_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

      // DB Transaction for local update
      const result = await AppDataSource.transaction(async (manager) => {
        // Lock wallet
        const lockedWallet = await manager.findOne(Wallet, {
          where: { id: wallet.id },
          lock: { mode: "pessimistic_write" },
        });

        if (!lockedWallet || lockedWallet.balance < amount) {
          throw new Error("Insufficient balance during processing");
        }

        // Deduct from balance
        lockedWallet.balance = Number(lockedWallet.balance) - amount;
        lockedWallet.totalBalance = Number(lockedWallet.balance) + Number(lockedWallet.pendingAmount);
        await manager.save(lockedWallet);

        // Create transaction record
        const tx = manager.create(Transaction, {
          professionalId: userId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PROCESSING,
          amount: amount,
          reference: reference,
          wallet: lockedWallet
        });
        await manager.save(tx);
        return { lockedWallet, tx };
      });

      // Call Flutterwave API
      try {
        const response = await this.flwClient.post("/transfers", {
          account_bank: bankCode,
          account_number: accountNumber,
          amount: Math.round(amount), // NGN
          narration: narration,
          currency: "NGN",
          reference,
          debit_currency: "NGN",
        });

        const transferData = response.data;

        if (transferData?.status !== "success") {
          throw new Error(transferData?.message ?? "Transfer initiation failed");
        }

        // Lock the account after successful initiation
        if (!usedAccount.isLocked) {
          await this.accountRepo.update({ id: usedAccount.id }, { isLocked: true });
          logger.info(`🔒 Account ${usedAccount.id} has been locked for security after first withdrawal.`);
        }

        return this.responseData(
          200,
          false,
          "Withdrawal initiated successfully",
          transferData.data
        );
      } catch (flwError: any) {
        const errorMessage = flwError.response?.data?.message || flwError.message || "Transfer initiation failed. Please try again later.";
        logger.error("Flutterwave API failed", flwError.response?.data || flwError.message);

        await AppDataSource.transaction(async (manager) => {
          const lockedWallet = await manager.findOne(Wallet, {
            where: { id: wallet.id },
            lock: { mode: "pessimistic_write" }
          });
          const failedTx = await manager.findOne(Transaction, { where: { id: result.tx.id } });

          if (lockedWallet && failedTx) {
            lockedWallet.balance = Number(lockedWallet.balance) + amount;
            lockedWallet.totalBalance = Number(lockedWallet.balance) + Number(lockedWallet.pendingAmount);
            failedTx.status = TransactionStatus.FAILED;
            await manager.save([lockedWallet, failedTx]);
          }
        });

        return this.responseData(
          500,
          true,
          errorMessage
        );
      }
    } catch (error: any) {
      console.error("Withdrawal failed:", error);
      return this.handleTypeormError(error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFY BOOKING TRANSACTION (unchanged logic)
  // ─────────────────────────────────────────────────────────────
  async verifyBookingTransaction(bookingId: string, userId: string) {
    try {
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingId, userId },
        relations: ["escrow", "user"],
      });

      if (!booking)
        return this.responseData(404, true, "Booking was not found");
      const escrow = booking.escrow;
      if (escrow && escrow.status !== EscrowStatus.PAID)
        return this.responseData(400, true, "Invalid Refund");

      const payment = await this.transactionRepo.findOne({
        where: {
          escrowId: escrow.id,
          type: TransactionType.BOOKING_DEPOSIT,
          status: TransactionStatus.PENDING,
          userId,
        },
        relations: ["escrow", "escrow.booking", "escrow.booking.professional"],
      });

      if (!payment)
        return this.responseData(404, true, "Payment was not found");
      if (!payment.flwTransactionId)
        return this.responseData(
          400,
          true,
          "Missing Flutterwave transaction ID",
        );

      const result = await this.verifyFlwTransaction(payment.flwTransactionId);
      return this.responseData(
        200,
        false,
        "Booking transaction has been verified",
        { status: result.status },
      );
    } catch (error) {
      logger.error(error);
      return this.handleTypeormError(error);
    }
  }
}
