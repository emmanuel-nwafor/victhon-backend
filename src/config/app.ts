import cors from "cors";
import express, { Application, NextFunction, Request, Response } from "express";
import helmet from "helmet";
import http from 'http';
import morgan from "morgan";
import { RedisClientType } from "redis";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import multerErrorHandler from "../middlewares/multerErrorHandler";
import initializeIO from "./io";
import logger from "./logger";

import account from "../routes/account";
import auth from "../routes/auth";
import booking from "../routes/booking";
import chat from "../routes/chat";
import payment from "../routes/payment";
import professional from "../routes/professional";
import review from "../routes/review";
import schedule from "../routes/schedule";
import service from "../routes/service";
import user from "../routes/user";
import wallet from "../routes/wallet";
import admin from "../routes/admin";
import { RedisStore } from "connect-redis";
import session from "express-session";
import socketEvent from "../io/events/socketEvent";
import validateJWT from "../middlewares/validateJWT";
import verifyJWT from "../middlewares/verifyJWT";
import { Namespaces, UserType } from "../types/constants";
import setting from "../routes/setting";


export default async function createApp(pubClient: RedisClientType, subClient: RedisClientType) {
    const app: Application = express();
    const stream = { write: (message: string) => logger.http(message.trim()) };
    const server = http.createServer(app);
    const io = await initializeIO(server, pubClient, subClient);

    // 1. Request Entry Diagnostic Logging
    app.use((req: Request, res: Response, next: NextFunction) => {
        logger.info(`🛫 Incoming: ${req.method} ${req.path}`);
        next();
    });

    // 2. CORS - FIXED: Changed '(.*)' to '*' to prevent path-to-regexp error
    app.use(cors({ origin: '*' }));
    app.options('*', cors()); // Changed from app.options('(.*)', cors())

    // 3. Morgan Logging
    app.use(morgan("combined", { stream }));

    app.use(
        '/api/v1/payments/webhook',
        express.json({
            verify: (req, res, buf) => {
                (req as any).rawBody = buf;
            }
        })
    );

    app.use(helmet());
    app.set('trust proxy', 1);
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Configure session with RedisStore
    app.use(session({
        store: new RedisStore({ client: pubClient }),
        secret: process.env.SESSION_SECRET || 'your-secret-key-here',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 24
        }
    }));

    const socketNamespace = io.of(Namespaces.BASE);
    socketNamespace.use(validateJWT([UserType.USER, UserType.PROFESSIONAL]));
    socketEvent.initialize(socketNamespace, io);

    // ROUTES
    app.use("/api/v1/auth", auth);
    app.use("/api/v1/users", verifyJWT([UserType.USER]), user);

    app.use("/api/v1/professionals/wallets", verifyJWT([UserType.PROFESSIONAL]), wallet);
    app.use("/api/v1/professionals", verifyJWT([UserType.PROFESSIONAL]), professional);

    app.use("/api/v1/accounts", verifyJWT([UserType.PROFESSIONAL]), account);
    app.use("/api/v1/schedules", schedule);
    app.use("/api/v1/bookings", booking);
    app.use("/api/v1/services", service);
    app.use("/api/v1/reviews", review);
    app.use("/api/v1/payments", payment);
    app.use("/api/v1/chats", chat);
    app.use("/api/v1/settings", verifyJWT([UserType.USER, UserType.PROFESSIONAL]), setting);
    app.use("/api/v1/admin", admin);

    // Root and Ping Routes (Helps Render health checks)
    app.get("/", (req: Request, res: Response) => {
        res.status(200).json({
            error: false,
            message: "Victhon API is running",
            version: "1.0.0"
        });
    });

    app.get("/ping", (req: Request, res: Response) => {
        res.status(200).json({
            error: false,
            message: "pong"
        });
    });

    app.use(multerErrorHandler);

    // Global 404 handler - FIXED: Replaced named logic to be safe
    app.use((req: Request, res: Response) => {
        logger.warn(`⚠️ 404 - Unmatched route: ${req.method} ${req.path}`);
        res.status(404).json({
            error: true,
            message: "Route not found.",
        });
    });

    // Global error handler
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        logger.error(`❌ Unhandled error: ${err.message}`, {
            stack: err.stack,
            method: req.method,
            path: req.path
        });
        res.status(err.status || 500).json({
            error: true,
            message: err.message || "An unexpected internal error occurred."
        });
    });

    return { server, io };
}