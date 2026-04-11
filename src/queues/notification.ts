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


const notification = new RabbitMQRouter({
    name: QueueNames.NOTIFICATION,
    durable: true,
    routingKeyPattern: 'notification.*',
    exchange: exchange,
    handlers: {}
});

const service = new BaseService();
const pushService = new PushNotificationService();
console.log('Notification queue worker ready');


function getNotificationContent(type: NotificationType, data: any) {
    switch (type) {
        case NotificationType.BOOKING:
            return { title: "New Booking", body: "You have a new booking request!" };
        case NotificationType.ACCEPTED_BOOKING:
            return { title: "Booking Accepted", body: "Your booking has been accepted by the service provider." };
        case NotificationType.REJECTED_BOOKING:
            return { title: "Booking Rejected", body: "Your booking request was rejected." };
        case NotificationType.VIEW_PROFILE:
            return { title: "Profile View", body: "Someone just viewed your profile!" };
        case NotificationType.BOOKING_PAYMENT:
            return { title: "Payment Received", body: "Payment for your booking has been received and processed successfully." };
        case NotificationType.CANCEL_BOOKING:
            return { title: "Booking Cancelled", body: "A booking has been cancelled." };
        case NotificationType.DISPUTED:
            return { title: "Booking Disputed", body: "A dispute has been opened for a booking." };
        case NotificationType.NEW_REVIEW:
            return { title: "New Review", body: "You have received a new review!" };
        case NotificationType.CHAT:
            const senderName = data?.senderName || "Someone";
            return { title: "New Message", body: `${senderName}: ${data?.content || "Sent you a message"}` };
        case NotificationType.ON_THE_WAY:
            return { title: "On The Way", body: "The service provider is on their way to your location." };
        case NotificationType.COMPLETED:
            return { title: "Service Completed", body: "The service has been marked as completed." };
        case NotificationType.REVIEW_BOOKING:
            return { title: "Booking in Review", body: "The service provider has marked the booking as ready for your review." };
        case NotificationType.ESCROW_RELEASE:
            return { title: "Funds Released", body: "Payment for your booking has been released to your wallet." };
        case NotificationType.REFUND_FAILED:
            return { title: "Refund Failed", body: "An attempt to refund your booking has failed. Please contact support." };
        case NotificationType.REFUNDED_BOOKING:
            return { title: "Booking Refunded", body: "Your booking has been successfully refunded." };
        case NotificationType.WELCOME:
            return { title: "Welcome to Victhon!", body: "We're glad to have you here. Explore and book services with ease!" };
        default:
            return { title: "Victhon Update", body: "You have a new notification." };
    }
}

notification.route(QueueEvents.NOTIFICATION_NOTIFY, async (message: any, io: Server) => {
    const { payload: { provider, data } } = message;

    try {
        if (provider == "socket" || provider == "push") {
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
            if (socketId && provider === "socket") {
                const notificationNamespace = io.of(Namespaces.BASE);
                notificationNamespace.to(socketId).emit("notification", { notification: savedNotification });
            }

            // handle push notification
            if (recipient?.pushToken) {
                try {
                    const { title, body } = getNotificationContent(data.type, data.data);

                    const result = await pushService.sendNotification(recipient.pushToken, title, body, {
                        ...data,
                        notificationId: savedNotification.id
                    });

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
            // Find specific user or pro token
            const user = await AppDataSource.getRepository(UserEntity).findOne({ where: { id: targetUserId }, select: ["pushToken"] });
            const pro = !user ? await AppDataSource.getRepository(ProfessionalEntity).findOne({ where: { id: targetUserId }, select: ["pushToken"] }) : null;
            
            if (user?.pushToken) recipientTokens.push(user.pushToken);
            if (pro?.pushToken) recipientTokens.push(pro.pushToken);
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
            const user = await AppDataSource.getRepository(UserEntity).findOne({ where: { id: targetUserId }, select: ["email"] });
            const pro = !user ? await AppDataSource.getRepository(ProfessionalEntity).findOne({ where: { id: targetUserId }, select: ["email"] }) : null;
            
            if (user?.email) recipientEmails.push(user.email);
            if (pro?.email) recipientEmails.push(pro.email);
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