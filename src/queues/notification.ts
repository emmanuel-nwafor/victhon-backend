import { Server } from "socket.io";
import RabbitMQRouter from "../utils/RabbitMQRouter";
import { Namespaces, QueueEvents, QueueNames, UserType } from "../types/constants";
import { Notification, NotificationStatus, NotificationType } from "../entities/Notification";
import BaseService from "../services/Service";
import logger from "../config/logger";
import UserService from "../services/User";
import { User as UserEntity } from "../entities/User";
import { Professional as ProfessionalEntity } from "../entities/Professional";
import ProfessionalService from "../services/Professional";
import { exchange } from "../types";
import { AppDataSource } from "../data-source";
import PushNotificationService from "../services/PushNotificationService";
import { getNotificationContent } from "../utils/notification";


const notification = new RabbitMQRouter({
    name: QueueNames.NOTIFICATION,
    durable: true,
    routingKeyPattern: 'notification.*',
    exchange: exchange,
    handlers: {}
});


const service = new BaseService();
const pushService = new PushNotificationService();


notification.route(QueueEvents.NOTIFICATION_NOTIFY, async (message: any, io: Server) => {
    const { payload: { provider, data } } = message;

    try {
        if (provider == "socket" || provider == "push" || provider == "both") {
            const userService = new UserService();
            const proService = new ProfessionalService();

            const socketId = data.userType == UserType.PROFESSIONAL
                ? await proService.getSocketId(data.userId)
                : await userService.getSocketId(data.userId);

            const repo = AppDataSource.getRepository(Notification);
            const userId = data.userType == UserType.PROFESSIONAL ? { professionalId: data.userId } : { userId: data.userId };

            const recipient = data.userType === UserType.PROFESSIONAL
                ? await AppDataSource.getRepository(ProfessionalEntity).findOne({ where: { id: data.userId } })
                : await AppDataSource.getRepository(UserEntity).findOne({ where: { id: data.userId } });

            // save notification to database
            const newNotification = repo.create({
                ...userId,
                type: data.type,
                data: data.data,
                userType: data.userType,
                status: socketId ? NotificationStatus.SENT : NotificationStatus.PENDING
            });

            const savedNotification = await repo.save(newNotification);

            // handle socket notification
            if (socketId && (provider === "socket" || provider === "both")) {
                const notificationNamespace = io.of(Namespaces.BASE);
                notificationNamespace.to(socketId).emit("notification", { notification: savedNotification });
            }

            // handle push notification
            if (recipient?.pushToken && (provider === "push" || provider === "both")) {
                try {
                    const { title, body, imageUrl } = getNotificationContent(data.type, data.data);
                    
                    const pushData = {
                        ...data,
                        notificationId: savedNotification.id,
                        imageUrl
                    };

                    const result = await pushService.sendNotification(recipient.pushToken, title, body, pushData);

                    console.log(`[NOTIFICATION_WORKER] ✅ Push status for ${data.userId}: ${result?.length ? 'SENT' : 'FAILED'}`);
                } catch (error) {
                    logger.error(`Failed to send push to User:${data.userId}:`, error);
                }
            }
        }
    } catch (error) {
        logger.error(`Error during message processing:`, error);
        service.handleTypeormError(error);
    }
});


notification.route(QueueEvents.NOTIFICATION_OFFLINE, async (message: any, io: Server) => {
    const { payload: { provider, data } } = message;

    try {

        if (provider == "socket") {
            const userService = new UserService();
            const socketId = await userService.getSocketId(data.userId);

            if (socketId) {
                const notificationNamespace = io.of(Namespaces.BASE);
                notificationNamespace.to(socketId).emit("notification", {
                    notification: data
                });
            } else {
                logger.info(`user:${data.userId} is offline`);
            }
        }
    } catch (error) {
        service.handleTypeormError(error);
    }
});

notification.route(QueueEvents.NOTIFICATION_BROADCAST_PUSH, async (message: any, io: Server) => {
    const { payload: { targets, title, content, targetUserId } } = message;
    try {
        let recipientTokens: string[] = [];
        
        if (targetUserId) {
            const ids = Array.isArray(targetUserId) ? targetUserId : [targetUserId];
            for (const id of ids) {
                const user = await AppDataSource.getRepository(UserEntity).findOne({ where: { id }, select: ["pushToken"] });
                const pro = !user ? await AppDataSource.getRepository(ProfessionalEntity).findOne({ where: { id }, select: ["pushToken"] }) : null;
                
                if (user?.pushToken) recipientTokens.push(user.pushToken);
                if (pro?.pushToken) recipientTokens.push(pro.pushToken);
            }
        } else {
            if (targets === "All Users" || targets === "Customers") {
                const users = await AppDataSource.getRepository(UserEntity)
                    .createQueryBuilder("user")
                    .where("user.pushToken IS NOT NULL")
                    .select("user.pushToken")
                    .getMany();
                recipientTokens.push(...users.map(u => u.pushToken));
            }
            
            if (targets === "All Users" || targets === "Professionals") {
                const pros = await AppDataSource.getRepository(ProfessionalEntity)
                    .createQueryBuilder("pro")
                    .where("pro.pushToken IS NOT NULL")
                    .select("pro.pushToken")
                    .getMany();
                recipientTokens.push(...pros.map(p => p.pushToken));
            }
        }

        if (recipientTokens.length > 0) {
            await pushService.sendNotification(recipientTokens, title, content);
            console.log(`[BROADCAST_WORKER] ✅ Pushed notification to ${recipientTokens.length} devices.`);
        }
    } catch (error) {
        logger.error(`Error broadcasting push:`, error);
    }
});

import EmailService from "../services/Email";
const emailService = new EmailService();

notification.route(QueueEvents.NOTIFICATION_BROADCAST_EMAIL, async (message: any, io: Server) => {
    const { payload: { targets, subject, content, targetUserId, attachments } } = message;
    try {
        let recipientEmails: string[] = [];
        
        if (targetUserId) {
            const ids = Array.isArray(targetUserId) ? targetUserId : [targetUserId];
            for (const id of ids) {
                const user = await AppDataSource.getRepository(UserEntity).findOne({ where: { id }, select: ["email"] });
                const pro = !user ? await AppDataSource.getRepository(ProfessionalEntity).findOne({ where: { id }, select: ["email"] }) : null;
                
                if (user?.email) recipientEmails.push(user.email);
                if (pro?.email) recipientEmails.push(pro.email);
            }
        } else {
            if (targets === "All Users" || targets === "Customers") {
                const users = await AppDataSource.getRepository(UserEntity)
                    .createQueryBuilder("user")
                    .select("user.email")
                    .getMany();
                recipientEmails.push(...users.map(u => u.email));
            }
            
            if (targets === "All Users" || targets === "Professionals") {
                const pros = await AppDataSource.getRepository(ProfessionalEntity)
                    .createQueryBuilder("pro")
                    .select("pro.email")
                    .getMany();
                recipientEmails.push(...pros.map(p => p.email));
            }
        }

        const chunkSize = 50; 
        for (let i = 0; i < recipientEmails.length; i += chunkSize) {
            const chunk = recipientEmails.slice(i, i + chunkSize);
            for (const email of chunk) {
                await emailService.sendEmail(email, subject, content, subject, attachments);
            }
        }
        console.log(`[BROADCAST_WORKER] ✅ Email broadcast sent to ${recipientEmails.length} recipients.`);
    } catch (error) {
        logger.error(`Error broadcasting emails:`, error);
    }
});

export default notification;