import { Server } from "socket.io";
import RabbitMQRouter from "../utils/RabbitMQRouter";
import notify from "../services/notify";
import BaseService from "../services/Service";
import { QueueEvents, QueueNames } from "../types/constants";
import { exchange } from "../types";
import logger from "../config/logger";
import UserCache from "../cache/UserCache";
import { UserType } from "../types/constants";
import Payment from "../services/Payment";
import { NotificationType } from "../entities/Notification";
import { AppDataSource } from "../data-source";
import { Transaction, TransactionStatus, TransactionType } from "../entities/Transaction";
import { Booking, BookingStatus } from "../entities/Booking";
import { In, LessThanOrEqual, MoreThanOrEqual, Not } from "typeorm";
import { Wallet } from "../entities/Wallet";
import { Escrow } from "../entities/Escrow";
import env, { EnvKey } from "../config/env";

const service = new BaseService();

const wallet = new RabbitMQRouter({
    name: QueueNames.WALLET,
    durable: true,
    routingKeyPattern: 'wallet.*',
    exchange: exchange,
    handlers: {}
});

console.log('--- [WORKER] 💰 Wallet Queue Worker Ready ---');

wallet.route(QueueEvents.WALLET_ESCROW_RELEASE, async (message: any) => {
    const { escrowId, professionalId, walletId } = message.payload;
    const rawFee = env(EnvKey.PLATFORM_FEE_PERCENT);
    const platFormFeePercent = rawFee ? parseFloat(rawFee) : 0;

    console.log(`[WALLET_WORKER] 📥 RECEIVED WALLET_ESCROW_RELEASE: Escrow=${escrowId}, Pro=${professionalId}, Wallet=${walletId}`);

    try {
        let amountToReleaseVal = 0;
        const result = await AppDataSource.transaction(async manager => {
            console.log(`[WALLET_WORKER] 🔍 Fetching escrow ${escrowId}...`);
            const escrow = await manager.findOne(Escrow, {
                where: { id: escrowId },
            });

            if (!escrow) {
                logger.error(`[WALLET_WORKER] ❌ Escrow ${escrowId} not found`);
                console.error(`[WALLET_WORKER] ❌ Escrow ${escrowId} not found`);
                throw new Error("Escrow not found");
            }

            amountToReleaseVal = Number(escrow.amount);
            console.log(`[WALLET_WORKER] 💰 Amount to release: ${amountToReleaseVal}`);

            // 🔒 lock wallet
            console.log(`[WALLET_WORKER] 🔒 Locking wallet ${walletId}...`);
            const wallet = await manager.findOne(Wallet, {
                where: { id: walletId },
                lock: { mode: "pessimistic_write" },
            });

            if (!wallet) {
                logger.error(`[WALLET_WORKER] ❌ Wallet ${walletId} not found`);
                console.error(`[WALLET_WORKER] ❌ Wallet ${walletId} not found`);
                throw new Error("Wallet not found");
            }

            // 🧱 idempotency guard
            const existingTx = await manager.findOne(Transaction, {
                where: {
                    escrowId,
                    type: TransactionType.ESCROW_RELEASE,
                },
            });

            if (existingTx) {
                logger.info(`[WALLET_WORKER] 🧱 Escrow ${escrowId} already released, skipping.`);
                console.log(`[WALLET_WORKER] 🧱 Already released, skipping.`);
                return null;
            }

            const currentPending = Number(wallet.pendingAmount) || 0;
            const amountToRelease = Number(amountToReleaseVal) || 0;

            console.log(`[WALLET_WORKER] 📊 Current State: Pending=${currentPending.toFixed(2)}, Balance=${wallet.balance}`);

            if (currentPending < amountToRelease) {
                logger.error(`[WALLET_WORKER] ❌ Insufficient pending balance. Required: ${amountToRelease}, Current: ${currentPending}`);
                console.error(`[WALLET_WORKER] ❌ Insufficient pending balance! Required: ${amountToRelease}, Available: ${currentPending}`);
                throw new Error(`Insufficient pending balance (Required: ${amountToRelease}, Available: ${currentPending})`);
            }

            const newPending = Number((currentPending - amountToRelease).toFixed(2));
            
            // Calculate fees safely
            const feePercent = isNaN(platFormFeePercent) ? 0 : platFormFeePercent;
            const platformFee = Number(((amountToRelease * feePercent) / 100).toFixed(2));
            const netAmount = Number((amountToRelease - platformFee).toFixed(2));
            const newBalance = Number((Number(wallet.balance || 0) + netAmount).toFixed(2));

            console.log(`[WALLET_WORKER] ➕ CALCULATION:
              - Gross: ${amountToRelease.toFixed(2)}
              - Fee (${feePercent}%): ${platformFee.toFixed(2)}
              - Net: ${netAmount.toFixed(2)}
              - Pending: ${currentPending.toFixed(2)} -> ${newPending.toFixed(2)}
              - Balance: ${wallet.balance} -> ${newBalance.toFixed(2)}`);

            await manager.update(
                Wallet,
                { id: wallet.id },
                {
                    pendingAmount: newPending,
                    balance: newBalance,
                    totalBalance: Number((newPending + newBalance).toFixed(2)),
                }
            );

            const tx = manager.create(Transaction, {
                professionalId,
                type: TransactionType.ESCROW_RELEASE,
                amount: netAmount,
                escrow: escrow,
                wallet: wallet,
                status: TransactionStatus.SUCCESS,
                reference: `release_${escrowId}`
            });

            logger.info(`[WALLET_WORKER] ✅ Successfully updated wallet ${walletId}`);
            console.log(`[WALLET_WORKER] ✅ Wallet updated successfully.`);

            return await manager.save(tx);
        });

        if (result) {
            console.log(`[WALLET_WORKER] 🔔 Triggering notification for professional ${professionalId}...`);
            await notify({
                userId: professionalId,
                userType: UserType.PROFESSIONAL,
                type: NotificationType.ESCROW_RELEASE,
                data: {
                    ...result,
                    grossAmount: amountToReleaseVal,
                    platformFee: (amountToReleaseVal * platFormFeePercent) / 100
                }
            });
    
            logger.info(`[WALLET_WORKER] 🏁 FINISHED release for escrow ${escrowId}`);
            console.log(`[WALLET_WORKER] 🏁 Process complete.`);
        }
    } catch (error) {
        console.error(`[WALLET_WORKER] 💀 CRITICAL FAILURE:`, error);
    }
});


export default wallet;