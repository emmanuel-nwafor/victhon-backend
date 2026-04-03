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

wallet.route(QueueEvents.WALLET_ESCROW_RELEASE, async (message: any) => {
    const { escrowId, professionalId, walletId } = message.payload;
    const rawFee = env(EnvKey.PLATFORM_FEE_PERCENT);
    const platFormFeePercent = rawFee ? parseFloat(rawFee) : 0;

    try {
        const result = await AppDataSource.transaction(async manager => {
            const escrow = await manager.findOne(Escrow, {
                where: { id: escrowId },
            });

            if (!escrow) {
                logger.error(`[WALLET_WORKER] Escrow ${escrowId} not found`);
                throw new Error("Escrow not found");
            }

            // 🔒 lock wallet
            const wallet = await manager.findOne(Wallet, {
                where: { id: walletId },
                lock: { mode: "pessimistic_write" },
            });

            if (!wallet) {
                logger.error(`[WALLET_WORKER] Wallet ${walletId} not found`);
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
                logger.info(`[WALLET_WORKER] Escrow ${escrowId} already released, skipping.`);
                return null;
            }

            const currentPending = Number(wallet.pendingAmount);
            const amountToRelease = Number(escrow.amount);


            if (currentPending < amountToRelease) {
                logger.error(`[WALLET_WORKER] Insufficient pending balance for wallet ${walletId}. Required: ${amountToRelease}, Current: ${currentPending}`);
                throw new Error(`Insufficient pending balance (Required: ${amountToRelease}, Available: ${currentPending})`);
            }

            const newPending = currentPending - amountToRelease;
            const platformFee = (amountToRelease * platFormFeePercent) / 100;
            const newBalance = Number(wallet.balance) + (amountToRelease - platformFee);

            await manager.update(
                Wallet,
                { id: wallet.id },
                {
                    pendingAmount: newPending,
                    balance: newBalance,
                    totalBalance: Number(newPending) + Number(newBalance),
                }
            );

            const tx = manager.create(Transaction, {
                professionalId,
                type: TransactionType.ESCROW_RELEASE,
                amount: amountToRelease,
                escrow: escrow,
                wallet: wallet,
                status: TransactionStatus.SUCCESS,
            });

            logger.info(`[WALLET_WORKER] Releasing ${amountToRelease} from pending to balance for pro ${professionalId}`);

            return await manager.save(tx);
        });

        if (result) {
            await notify({
                userId: professionalId,
                userType: UserType.PROFESSIONAL,
                type: NotificationType.ESCROW_RELEASE,
                data: result
            });
    
            logger.info(`✅ Escrow released for escrow ${escrowId}`);
        }
    } catch (error) {
        console.error(error);
    }
});


export default wallet;