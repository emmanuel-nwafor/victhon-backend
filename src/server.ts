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
import { Admin } from "./entities/Admin";
import Password from "./utils/Password";

const PORT = env(EnvKey.PORT)!;

(async () => {
    try {
        logger.info(`Starting Victhon Backend on port ${PORT}`);

        // Verify essential environment variables
        const essentialEnvVars = [
            EnvKey.TOKEN_SECRET,
            EnvKey.DATABASE_URL,
            EnvKey.REDIS_URL,
            EnvKey.RABBIT_MQ,
            EnvKey.STORED_SALT
        ];

        essentialEnvVars.forEach(key => {
            const val = env(key);
            if (!val) {
                logger.warn(`⚠️ Missing essential environment variable: ${key}`);
            } else {
                logger.info(`✅ Environment variable loaded: ${key} (length: ${val.length})`);
            }
        });

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
            .then(async () => {
                logger.info("Database connected successfully");

                // Initialize default admin if none exist
                try {
                    const adminRepo = AppDataSource.getRepository(Admin);

                    const email = env(EnvKey.DEFAULT_ADMIN_EMAIL);
                    const rawPassword = env(EnvKey.DEFAULT_ADMIN_PASSWORD);
                    const storedSalt = env(EnvKey.STORED_SALT);

                    if (email && rawPassword && storedSalt) {
                        const password = Password.hashPassword(rawPassword, storedSalt);
                        const existingAdmin = await adminRepo.findOneBy({ email });

                        if (!existingAdmin) {
                            const defaultAdmin = adminRepo.create({
                                email,
                                password,
                                firstName: "System",
                                lastName: "Admin",
                                role: "superadmin",
                                permissions: [],
                                isActive: true
                            });
                            await adminRepo.save(defaultAdmin);
                            logger.info("Default admin account initialized successfully.");
                        } else if (existingAdmin.password !== password) {
                            existingAdmin.password = password;
                            await adminRepo.save(existingAdmin);
                            logger.info("Default admin password synchronized with environment variables.");
                        }
                    } else {
                        logger.warn("Missing DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, or STORED_SALT in env. Skip admin creation/sync.");
                    }
                } catch (adminErr) {
                    logger.error("Failed to initialize default admin", adminErr);
                }
            })
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

        const serverInstance = app.listen(PORT, async () => {
            logger.info(`🚀 Server successfully listening on port ${PORT}`);
            logger.info(`🌍 External URL: https://victhon-backend-khau.onrender.com`);

            // Keep-alive ping on startup
            try {
                const url = "https://victhon-backend-khau.onrender.com/api/v1/health-bypass";
                await axios.get(url);
                logger.info(`✅ Keep-alive startup ping sent to ${url}`);
            } catch (err: any) {
                logger.warn(`⚠️ Keep-alive startup ping failed: ${err.message}`);
            }
        });

        // TCP-level connection diagnostic
        serverInstance.on('connection', (socket) => {
            const remoteIP = socket.remoteAddress;
            // logger.info(`🔌 [TCP_CONN] New connection established from: ${remoteIP}`);

            // Log when we actually receive the first byte of data
            socket.once('data', (data) => {
                logger.info(`📥 [TCP_DATA] Received ${data.length} bytes from ${remoteIP}: ${data.toString().slice(0, 30).replace(/\r\n/g, ' ')}...`);
            });
        });

        serverInstance.on('error', (err) => {
            logger.error('❌ Server failed to start:', err);
        });
    } catch (err: any) {
        logger.warn(`⚠️ Keep-alive startup ping failed: ${err.message}`);
    }
})();

cron.schedule('*/14 * * * *', async () => {
    try {
        const url = "https://victhon-backend-khau.onrender.com/api/v1/health-bypass";
        const axios = require("axios");
        await axios.get(url);
        logger.info(`🔄 Keep-alive cron ping sent to ${url}`);
    } catch (err: any) {
        logger.warn(`⚠️ Keep-alive cron ping failed: ${err.message}`);
    }
});

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

let isAutoRefundRunning = false;
// Run every hour to auto-refund/cancel inactive bookings
cron.schedule('0 * * * *', async () => {
    if (isAutoRefundRunning) return;
    isAutoRefundRunning = true;
    try {
        const bookingService = new BookingService();
        await bookingService.autoRefundInactiveBookings();
    } catch (err) {
        console.error('Auto-refund cron failed', err);
    } finally {
        isAutoRefundRunning = false;
    }
});
