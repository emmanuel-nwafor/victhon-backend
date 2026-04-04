import cron from "node-cron";
import { createClient, RedisClientType } from "redis";
import env, { EnvKey } from "./config/env";
import axios from "axios";
import { AppDataSource } from "./data-source";
import redisClient from "./config/redis";
import createApp from "./config/app";
import { Worker } from "bullmq";
import { IWorker, WorkerConfig } from "./types";
import { RabbitMQ } from "./services/RabbitMQ";
import { QueueName, QUEUES } from "./config/queues";
import Payment from "./services/Payment";
import BookingService from "./services/Booking";
import { OfflineNotification } from "./jobs/OfflineNotification";
import { Inbox } from "./jobs/Inbox";
import logger from "./config/logger";

const PORT = env(EnvKey.PORT)!;

(async () => {
    try {
        logger.info(`Starting Victhon Backend on port ${PORT}`);

        redisClient.on("connect", () => {
            logger.info(`Redis connected on port ${redisClient.options.port}`);
        });

        redisClient.on('error', (err) => {
            logger.error('Redis connection error:', err);
        });


        // const pubClient: RedisClientType = createClient({ url: env(EnvKey.REDIS_URL)! });
        const pubClient: RedisClientType = createClient({
            url: env(EnvKey.REDIS_URL)!,  // e.g., rediss://...
            socket: { reconnectStrategy: retries => Math.min(retries * 50, 500) }  // Exponential backoff
        });
        pubClient.on("error", (err) => {
            logger.error('Redis pubClient connection error:', err);
        });

        const subClient: RedisClientType = pubClient.duplicate();
        subClient.on("error", (err) => {
            logger.error('Redis subClient connection error:', err);
        });
        await Promise.all([pubClient.connect(), subClient.connect()]);


        await RabbitMQ.connect();

        await AppDataSource.initialize()
            .then(() => logger.info("Database connected successfully"))
            .catch(err => logger.error("Database connection failed", err));

        const { server: app, io } = await createApp(pubClient, subClient);

        for (const queueName of Object.keys(QUEUES) as QueueName[]) RabbitMQ.startConsumer(queueName, io); //! Add try catch

        const workerConfig: WorkerConfig = {
            connection: { url: env(EnvKey.REDIS_URL)!, maxRetriesPerRequest: null, enableReadyCheck: false },
            drainDelay: 3000,
            stalledInterval: 300000,
        };

        const IWorkers: IWorker<any>[] = [
            new OfflineNotification(workerConfig, io),
            new Inbox(workerConfig, io),
        ];

        for (const IWorker of IWorkers) {
            const worker = new Worker(IWorker.queueName, IWorker.process.bind(IWorker), IWorker.config);
            if (IWorker.completed) worker.on('completed', IWorker.completed);
            if (IWorker.failed) worker.on('failed', IWorker.failed);
            if (IWorker.drained) worker.on('drained', IWorker.drained);
        }

        app.listen(PORT, () => logger.info(`Server listening on port ${PORT}`));
    } catch (error) {
        logger.error("Initialization error:", error);
    }

})();

let isRunning = false;

cron.schedule('*/5 * * * *', async () => {
    if (isRunning) return;

    isRunning = true;

    try {
        const paymentService = new Payment();
        await paymentService.reconcilePendingTransactions();
    } catch (err) {
        console.error('Reconciliation cron failed', err);
    } finally {
        isRunning = false;
    }
});

let isEscrowRunning = false;
// Run every day at midnight to auto-complete old bookings
cron.schedule('0 0 * * *', async () => {
    if (isEscrowRunning) return;
    isEscrowRunning = true;
    try {
        const bookingService = new BookingService();
        await bookingService.autoCompleteReviewBookings();
    } catch (err) {
        console.error('Auto-escrow release cron failed', err);
    } finally {
        isEscrowRunning = false;
    }
});
