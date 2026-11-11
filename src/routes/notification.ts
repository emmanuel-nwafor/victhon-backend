import { Router, Request, Response } from 'express';
import asyncHandler from "express-async-handler";
import Controller from "../controllers/Notification";
import {
    users,
    professionals,
} from '../middlewares/routes/notification';
import { UserType } from '../types/constants';
import verifyJWT from '../middlewares/verifyJWT';
import PromotionalNotificationService from '../services/PromotionalNotificationService';

const notification = Router();

notification.get("/users/:id", verifyJWT([UserType.USER]), asyncHandler(Controller.notification(UserType.USER)));
notification.get("/professionals/:id", verifyJWT([UserType.PROFESSIONAL]), asyncHandler(Controller.notification(UserType.PROFESSIONAL)));

notification.get("/professionals", professionals, asyncHandler(Controller.notifications(UserType.PROFESSIONAL)));
notification.get("/users", users, asyncHandler(Controller.notifications(UserType.USER)));

// Promotional notification triggers
notification.post("/promotional/miss-you", asyncHandler(async (req: Request, res: Response) => {
    const service = new PromotionalNotificationService();
    const result = await service.sendInactiveUserReminders(Number(req.query.days) || 7);
    res.json({ message: "Miss-you promotional campaign executed", ...result });
}));

notification.post("/promotional/discover", asyncHandler(async (req: Request, res: Response) => {
    const service = new PromotionalNotificationService();
    const result = await service.sendDiscoverNearbyProviders();
    res.json({ message: "Discover campaign executed", ...result });
}));

export default notification;