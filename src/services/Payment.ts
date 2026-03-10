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

  private readonly FLW_SECRET_KEY = env(EnvKey.FLW_SECRET_KEY)!;

  // This is NOT your secret key — it's a plain custom string you define yourself
  // on the Flutterwave Dashboard → Settings → Webhooks → "Secret hash"
  private readonly FLW_SECRET_HASH = env(EnvKey.FLW_SECRET_HASH)!;

  // The URL Flutterwave redirects to after payment completes
  // Flutterwave appends: ?status=successful&tx_ref=booking_xxx&transaction_id=12345678
  private readonly FLW_REDIRECT_URL = env(EnvKey.FLW_REDIRECT_URL)!;

  // ─────────────────────────────────────────────────────────────
  // Shared axios instance — Authorization: Bearer <secret_key>
  // ─────────────────────────────────────────────────────────────
  private get flwClient() {
    return axios.create({
      baseURL: FLW_BASE_URL,
      headers: {
        Authorization: `Bearer ${this.FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // INITIALIZE BOOKING PAYMENT
  //
  // Flow:
  //   1. Backend calls POST /v3/payments → Flutterwave returns a hosted link
  //   2. Backend returns { payment_link, tx_ref } to frontend
  //   3. Frontend redirects the user to payment_link
  //   4. After payment Flutterwave redirects back to FLW_REDIRECT_URL with:
  //      ?status=successful&tx_ref=booking_xxx&transaction_id=12345678
  //   5. Frontend calls GET /payment/verify/:transaction_id to confirm
  // ─────────────────────────────────────────────────────────────
  public async initializeBookingPayment(bookingId: string, userId: string) {
    try {
      const booking = await this.bookingRepo.findOne({
        where: { id: bookingId, userId },
        relations: ["escrow", "user", "professional.wallet"],
      });

      if (!booking)
        return this.responseData(404, true, "Booking was not found");
      if (booking.status !== BookingStatus.ACCEPTED)
        return this.responseData(
          400,
          true,
          "Booking has not yet been accepted",
        );
      if (booking.escrow.status !== EscrowStatus.PENDING)
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

      // Idempotency: return existing pending transaction if already initialized
      const existingTx = await this.transactionRepo.findOne({
        where: {
          escrowId: booking.escrow.id,
          type: TransactionType.BOOKING_DEPOSIT,
          status: TransactionStatus.PENDING,
        },
      });

      if (existingTx) {
        return this.responseData(200, false, "Payment already initialized", {
          payment_link: existingTx.paymentLink,
          tx_ref: existingTx.reference,
        });
      }

      // Generate unique tx_ref
      const tx_ref = `booking_${booking.id}_${Date.now()}`;

      // Create transaction record first (FAILED until Flutterwave confirms)
      const transaction = this.transactionRepo.create({
        userId,
        type: TransactionType.BOOKING_DEPOSIT,
        amount: booking.escrow.amount,
        escrowId: booking.escrow.id,
        status: TransactionStatus.FAILED,
        reference: tx_ref,
        walletId: wallet.id,
      });
      await this.transactionRepo.save(transaction);

      // Call Flutterwave to create the hosted payment page
      const response = await this.flwClient.post("/payments", {
        tx_ref,
        amount: Number(booking.escrow.amount), // NGN — no kobo conversion needed
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

        // Update transaction to PENDING now that we have the link
        transaction.status = TransactionStatus.PENDING;
        transaction.paymentLink = payment_link;
        await this.transactionRepo.save(transaction);

        return this.responseData(
          200,
          false,
          "Payment was initiated successfully",
          {
            payment_link, // Frontend redirects user to this URL
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

  // ─────────────────────────────────────────────────────────────
  // VERIFY TRANSACTION (internal — used by reconciliation job)
  //
  // Paystack: GET /transaction/verify/:reference  (string reference)
  // Flutterwave: GET /v3/transactions/:transaction_id/verify  (numeric ID)
  //
  // The numeric transaction_id comes from:
  //   - The ?transaction_id= query param in the redirect URL
  //   - The data.id field in the webhook payload
  //
  // We store this as flwTransactionId on the Transaction entity.
  // ─────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // VERIFY TRANSACTION SERVICE (HTTP endpoint — called by frontend after redirect)
  //
  // After the Flutterwave redirect, the frontend receives:
  //   ?status=successful&tx_ref=booking_xxx&transaction_id=12345678
  //
  // The frontend calls: GET /payment/verify/:transaction_id
  // This endpoint hits Flutterwave to confirm the transaction is genuine.
  // ─────────────────────────────────────────────────────────────
  public async verifyFlwTransactionService(flwTransactionId: string) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.flwClient.get(
          `/transactions/${flwTransactionId}/verify`,
        );

        const data = response.data?.data;

        // Save flwTransactionId on the transaction record using tx_ref
        if (data?.tx_ref) {
          await this.transactionRepo.update(
            { reference: data.tx_ref },
            { flwTransactionId: String(flwTransactionId) },
          );
        }

        return this.responseData(
          200,
          false,
          "Successful verification",
          response.data,
        );
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to verify transaction after ${MAX_RETRIES} attempts`,
          );
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

  // ─────────────────────────────────────────────────────────────
  // RECONCILE PENDING TRANSACTIONS
  // Logic unchanged — only the verify call is updated.
  // Requires flwTransactionId to be stored on the Transaction entity
  // (set when the frontend calls verify after the redirect).
  // ─────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // SUCCESSFUL CHARGE (called by RabbitMQ consumer after webhook)
  // Logic unchanged
  // ─────────────────────────────────────────────────────────────
  public async successfulCharge(eventData: any) {
    try {
      const { transactionId } = eventData.metadata ?? eventData.meta ?? {};

      if (!transactionId) {
        logger.error("No transactionId in webhook metadata");
        return;
      }

      let eventToPublish = null;

      await AppDataSource.transaction(async (manager) => {
        const payment = await manager.findOne(Transaction, {
          where: { id: transactionId },
          relations: [
            "escrow",
            "escrow.booking",
            "escrow.booking.professional",
            "escrow.booking.professional.wallet",
          ],
          lock: { mode: "pessimistic_write" },
        });

        if (!payment) {
          logger.error(`Payment not found for transactionId: ${transactionId}`);
          throw new Error("Transaction not found");
        }

        if (payment.status === TransactionStatus.SUCCESS) {
          logger.info(`Payment already processed: ${transactionId}`);
          return;
        }

        await manager.update(
          Transaction,
          { id: transactionId },
          { status: TransactionStatus.SUCCESS },
        );

        if (payment.type === TransactionType.BOOKING_DEPOSIT) {
          const escrow = payment.escrow;
          if (!escrow) throw new Error("Escrow not found for transaction");

          if (escrow.status === EscrowStatus.PAID) {
            logger.info(
              `Escrow already PAID for transaction: ${transactionId}`,
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

          const newPendingAmount =
            Number(wallet.pendingAmount) + Number(escrow.amount);
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
              transactionId,
              professionalId: escrow.booking.professionalId,
            },
          };
        }

        logger.info(
          `🤑 Payment successfully processed for transaction: ${transactionId}`,
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

  // ─────────────────────────────────────────────────────────────
  // DISPUTE (logic unchanged)
  // ─────────────────────────────────────────────────────────────
  public async dispute(reference: string) {
    try {
      const result = await AppDataSource.transaction(async (manager) => {
        const transactionRepo = manager.getRepository(Transaction);
        const disputeRepo = manager.getRepository(Dispute);

        const transaction = await transactionRepo.findOne({
          where: { reference, status: TransactionStatus.SUCCESS },
          relations: ["escrow", "escrow.booking", "wallet"],
          lock: { mode: "pessimistic_write" },
        });

        if (!transaction) {
          logger.error(`Transaction not found for reference: ${reference}`);
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

        const disputeTx = transactionRepo.create({
          userId: transaction.userId!,
          escrowId: transaction.escrow!.id,
          amount: transaction.amount,
          type: TransactionType.DISPUTE,
          status: TransactionStatus.PENDING,
          reference,
        });

        const newDispute = disputeRepo.create({
          transactionId: transaction.id,
          amount: transaction.amount,
          reason: "Dispute initiated",
        });

        escrow.status = EscrowStatus.DISPUTED;

        const booking = escrow.booking;
        if (!booking) {
          logger.error(`Booking not found for escrow: ${escrow.id}`);
          return;
        }

        const wallet = transaction.wallet;
        if (!wallet) {
          logger.error(`Wallet not found`);
          return;
        }

        booking.status = BookingStatus.CANCELLED;
        wallet.pendingAmount =
          Number(wallet.pendingAmount) - Number(transaction.amount);
        wallet.totalBalance =
          Number(wallet.balance) + Number(wallet.pendingAmount);

        await manager.save([
          transaction,
          disputeTx,
          escrow,
          wallet,
          booking,
          newDispute,
        ]);
        return booking;
      });

      if (result) {
        await notify({
          userId: result.professionalId,
          userType: UserType.PROFESSIONAL,
          type: NotificationType.CANCEL_BOOKING,
          data: { ...result, professional: undefined },
        });
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
  // Paystack: POST /refund { transaction: reference, amount }
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

        await notify({
          userId: booking.professionalId,
          userType: UserType.PROFESSIONAL,
          type: NotificationType.DISPUTED,
          data: { ...booking, professional: undefined },
        });

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
        await notify({
          userId: result.userId,
          userType: UserType.USER,
          type: NotificationType.REFUND_FAILED,
          data: result,
        });
        logger.info(`💸 Refund failed for transaction: ${result.id}`);
      }
    } catch (error) {
      console.error(error);
      this.handleTypeormError(error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // WEBHOOK
  //
  // Flutterwave webhook verification is DIFFERENT from Paystack:
  //
  //   Paystack:      HMAC-SHA512 of raw body → compare to 'x-paystack-signature' header
  //   Flutterwave:   Plain string comparison of 'verif-hash' header
  //                  against FLW_SECRET_HASH env var (a custom string YOU set on the dashboard)
  //
  // To set up: Flutterwave Dashboard → Settings → Webhooks → "Secret hash"
  // Set FLW_SECRET_HASH in your .env to that same string.
  //
  // Flutterwave event names:
  //   charge.completed  → payment (data.status === 'successful' | 'failed')
  //   transfer.completed → payout (data.status === 'SUCCESSFUL' | 'FAILED')
  //
  // Note: Flutterwave does NOT have a dedicated refund webhook event.
  // Refund status is confirmed inline when the refund API call succeeds.
  // ─────────────────────────────────────────────────────────────
  public async webhook(payload: any, signature: any) {
    // Plain string comparison — NOT an HMAC hash
    if (!signature || signature !== this.FLW_SECRET_HASH) {
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

  // ─────────────────────────────────────────────────────────────
  // WITHDRAW (Payout to professional's bank account)
  //
  // Paystack: 2 steps — POST /transferrecipient → POST /transfer
  // Flutterwave: 1 step — POST /v3/transfers  (bank details passed directly)
  //
  // Fields:
  //   account_bank   = 3-digit bank code, e.g. "044" for Access Bank
  //   account_number = NUBAN account number
  //   amount         = NGN amount (NOT kobo)
  //   reference      = your unique reference for this transfer
  //   currency       = "NGN"
  //   narration      = description shown on recipient's statement
  //   debit_currency = "NGN"
  // ─────────────────────────────────────────────────────────────
  public async withdraw(userId: string, accountId: string, amount: number) {
    try {
      const account = await this.accountRepo.findOne({
        where: { id: accountId, professionalId: userId },
        relations: ["professional", "professional.wallet"],
      });

      if (!account) return this.responseData(404, true, "Account not found");

      const wallet = account.professional.wallet;

      if (wallet.balance < amount)
        return this.responseData(400, true, "Insufficient balance");
      if (amount < 10000)
        return this.responseData(400, true, "Amount too low for withdrawal");

      const reference = `wd_${userId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const response = await this.flwClient.post("/transfers", {
        account_bank: account.bankCode,
        account_number: account.accountNumber,
        amount: Math.round(amount), // NGN — not kobo
        narration: `Withdrawal — Service Provider ${userId}`,
        currency: "NGN",
        reference,
        debit_currency: "NGN",
      });

      const transferData = response.data;

      if (transferData?.status !== "success") {
        return this.responseData(
          500,
          true,
          transferData?.message ?? "Transfer initiation failed",
        );
      }

      return this.responseData(
        200,
        false,
        "Withdrawal initiated successfully",
        transferData.data,
      );
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
