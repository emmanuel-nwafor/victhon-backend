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

// wallet queue worker
console.log('Wallet queue worker ready');

wallet.route(QueueEvents.WALLET_ESCROW_RELEASE, async (message: any) => {
    const { escrowId, professionalId, walletId } = message.payload;
    const rawFee = env(EnvKey.PLATFORM_FEE_PERCENT);
    const platFormFeePercent = rawFee ? parseFloat(rawFee) : 0;

    try {
        let amountToReleaseVal = 0;
        const result = await AppDataSource.transaction(async manager => {
            const escrow = await manager.findOne(Escrow, {
                where: { id: escrowId },
            });

            if (!escrow) {
                logger.error(`Escrow ${escrowId} not found`);
                throw new Error("Escrow not found");
            }

            amountToReleaseVal = Number(escrow.amount);

            // lock wallet
            const wallet = await manager.findOne(Wallet, {
                where: { id: walletId },
                lock: { mode: "pessimistic_write" },
            });

            if (!wallet) {
                logger.error(`Wallet ${walletId} not found`);
                throw new Error("Wallet not found");
            }

            // idempotency guard
            const existingTx = await manager.findOne(Transaction, {
                where: {
                    escrowId,
                    type: TransactionType.ESCROW_RELEASE,
                },
            });

            if (existingTx) {
                return null;
            }

            const currentPending = Number(wallet.pendingAmount) || 0;
            const amountToRelease = Number(amountToReleaseVal) || 0;

            if (currentPending < amountToRelease) {
                logger.error(`Insufficient pending balance. Required: ${amountToRelease}, Current: ${currentPending}`);
                throw new Error(`Insufficient pending balance (Required: ${amountToRelease}, Available: ${currentPending})`);
            }

            const newPending = Number((currentPending - amountToRelease).toFixed(2));
            
            // calculate fees safely
            const feePercent = isNaN(platFormFeePercent) ? 0 : platFormFeePercent;
            const platformFee = Number(((amountToRelease * feePercent) / 100).toFixed(2));
            const netAmount = Number((amountToRelease - platformFee).toFixed(2));
            const newBalance = Number((Number(wallet.balance || 0) + netAmount).toFixed(2));

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

            logger.info(`Successfully updated wallet ${walletId}`);
            return await manager.save(tx);
        });

        if (result) {
            // trigger notification for professional
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