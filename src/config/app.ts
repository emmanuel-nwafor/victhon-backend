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


import { RedisStore } from "connect-redis";
import session from "express-session";
import socketEvent from "../io/events/socketEvent";
import validateJWT from "../middlewares/validateJWT";
import verifyJWT from "../middlewares/verifyJWT";
import { Namespaces, UserType } from "../types/constants";


export default async function createApp(pubClient: RedisClientType, subClient: RedisClientType) {
    const app: Application = express();
    const stream = {write: (message: string) => logger.http(message.trim())};
    const server = http.createServer(app);
    const io = await initializeIO(server, pubClient, subClient);

    app.use(
        '/api/v1/payments/webhook',
        express.json({
            verify: (req, res, buf) => {
                (req as any).rawBody = buf;
            }
        })
    );


    app.use(helmet());
    app.set('trust proxy', 1); // For a single proxy (e.g., Render)
    app.use(express.urlencoded({extended: true}));
    app.use(cors({origin: '*'}))
    app.use(morgan("combined", {stream}));
    app.use(express.json());

    // Configure session with RedisStore
    app.use(session({
        store: new RedisStore({client: pubClient}),
        secret: process.env.SESSION_SECRET || 'your-secret-key-here',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            maxAge: 1000 * 60 * 60 * 24 // 1 day expiration (adjust as needed)
        }
    }));


    const socketNamespace = io.of(Namespaces.BASE);
    socketNamespace.use(validateJWT([UserType.USER, UserType.PROFESSIONAL]));
    socketEvent.initialize(socketNamespace, io);


    app.use("/api/v1/auth", auth);
    app.use("/api/v1/users", verifyJWT([UserType.USER]), user);
    app.use("/api/v1/professionals", verifyJWT([UserType.PROFESSIONAL]), professional);
    app.use("/api/v1/accounts", verifyJWT([UserType.PROFESSIONAL]), account);
    app.use("/api/v1/schedules", schedule);
    app.use("/api/v1/bookings", booking);
    app.use("/api/v1/services", service);
    app.use("/api/v1/reviews", review);
    app.use("/api/v1/payments", payment);
    app.use("/api/v1/chats", chat);

    app.use("/api/v1/professionals/wallets", verifyJWT([UserType.PROFESSIONAL]), wallet);


    app.post("/api/v1/test", async (req: Request, res: Response) => {

        try {
            let {lat = 9.076479, lng = 7.401962, radius = 5} = req.query;
            const parsedRaduis = (radius as any) * 1000;

            if (!lat || !lng) {
                return res.status(400).json({
                    message: "lat and lng are required query params"
                });
            }

            const users = await AppDataSource
                .getRepository(User)
                .createQueryBuilder("user")
                .select([
                    "user.id AS id",
                    "user.email AS email",
                    "user.phone AS phone",
                    "user.firstName AS firstName",
                    "user.lastName AS lastName",
                    "ST_AsText(user.location) AS location"
                ])
                .addSelect(`ST_Distance_Sphere(ST_GeomFromText('POINT(${lng} ${lat})', 4326),user.location)`,
                    "distance"
                )
                .where("user.location IS NOT NULL")
                .having("distance <= :radius", {radius: parsedRaduis})
                .orderBy("distance", "ASC")
                .getRawMany();

            // Convert POINT string to JSON lat/lng
            const parsed = users.map((u: any) => {
                if (u.location) {
                    const coords = u.location.replace("POINT(", "").replace(")", "").split(" ");
                    u.location = {
                        longitude: parseFloat(coords[0]),
                        latitude: parseFloat(coords[1])
                    };
                }
                u.distance = Math.round(u.distance);
                return u;
            });

            return res.json({
                status: "success",
                count: parsed.length,
                users: parsed
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({error: "Server error"});
        }
    });

    app.get("/ping", async (req: Request, res: Response) => {


        res.status(200).json({
            error: false,
            message: "pinging api"
        });
        return;
    });


    app.use(multerErrorHandler);
    app.use((req: Request, res: Response, next: NextFunction) => {
        console.warn(`Unmatched route: ${req.method} ${req.path}`);
        res.status(404).json({
            error: true,
            message: "Route not found. Please check the URL or refer to the API documentation.",
        });
        return;
    });

    return {server, io};
}