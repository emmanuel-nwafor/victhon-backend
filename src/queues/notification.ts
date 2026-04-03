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

function getNotificationContent(type: NotificationType, data: any) {
    switch (type) {
        case NotificationType.BOOKING:
            return { title: "New Booking", body: "You have a new booking request!" };
        case NotificationType.ACCEPTED_BOOKING:
            return { title: "Booking Accepted", body: "Your booking has been accepted by the professional." };
        case NotificationType.REJECTED_BOOKING:
            return { title: "Booking Rejected", body: "Your booking request was rejected." };
        case NotificationType.VIEW_PROFILE:
            return { title: "Profile View", body: "Someone just viewed your profile!" };
        case NotificationType.BOOKING_PAYMENT:
            return { title: "Payment Received", body: "Payment for your booking has been received." };
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
            return { title: "On The Way", body: "The professional is on their way to your location." };
        case NotificationType.COMPLETED:
            return { title: "Service Completed", body: "The service has been marked as completed." };
        default:
            return { title: "Victhon Update", body: "You have a new notification." };
    }
}

notification.route(QueueEvents.NOTIFICATION_NOTIFY, async (message: any, io: Server) => {
    const { payload: { provider, data } } = message;

    try {
        console.log(`[NOTIFICATION_WORKER] Processing notification for user: ${data.userId}, type: ${data.userType}, provider: ${provider}`);
        
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

            // 1. Save notification to Database
            const newNotification = repo.create({
                ...userId,
                type: data.type,
                data: data.data,
                userType: data.userType,
                status: socketId ? NotificationStatus.SENT : NotificationStatus.PENDING
            });

            const savedNotification = await repo.save(newNotification);
            console.log(`[NOTIFICATION_WORKER] Saved notification ${savedNotification.id} to DB.`);

            // 2. Handle Socket Notification (Fast)
            if (socketId && provider === "socket") {
                logger.info(`🏃 Notifying ${data.userType}:${data.userId} via Socket, type:${data.type}`)
                console.log(`[NOTIFICATION_WORKER] Emitting socket event to ${data.userType} ${data.userId}`);

                const notificationNamespace = io.of(Namespaces.BASE);
                notificationNamespace.to(socketId).emit("notification", { notification: savedNotification });
            } else if (!socketId && provider === "socket") {
                logger.info(`📴 User ${data.userId} is offline, skipping Socket`)
                console.log(`[NOTIFICATION_WORKER] User ${data.userId} is offline, skipping socket emit.`);
            }

            // 3. Handle Push Notification (Potentially slower, so we catch and log)
            if (recipient?.pushToken) {
                try {
                    const { title, body } = getNotificationContent(data.type, data.data);
                    logger.info(`📱 Sending push notification to ${data.userId} (${data.userType}): ${title}`);
                    console.log(`[NOTIFICATION_WORKER] Sending push to ${recipient.email || data.userId}...`);
                    
                    const result = await pushService.sendNotification(recipient.pushToken, title, body, {
                        notificationId: savedNotification.id,
                        type: data.type,
                    });
                    
                    logger.info(`📱 Push notification result for ${data.userId}: ${result ? 'Sent to Expo' : 'Failed'}`);
                    console.log(`[NOTIFICATION_WORKER] Push notification result for ${recipient.email || data.userId}: ${result ? 'SUCCESS' : 'FAILED'}`);
                } catch (pushError) {
                    console.error(`[NOTIFICATION_WORKER] ERROR: Fatal failure sending push to ${data.userId}:`, pushError);
                }
            } else {
                if (provider === "push") {
                   logger.warn(`⚠️ Cannot send push to ${data.userId}: No pushToken found.`);
                   console.log(`[NOTIFICATION_WORKER] WARNING: Required push but no pushToken found for ${data.userId}`);
                } else {
                   console.log(`[NOTIFICATION_WORKER] No pushToken found for ${data.userId}, skipping push.`);
                }
            }
        }
        console.log(`[NOTIFICATION_WORKER] Finished processing notification for ${data.userId}`);
    } catch (error) {
        console.error(`[NOTIFICATION_WORKER] FATAL ERROR during message processing:`, error);
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
                logger.info(`🏃 Notifying user:${data.userId}, type:${data.type}`)

                const notificationNamespace = io.of(Namespaces.BASE);
                notificationNamespace.to(socketId).emit("notification", {
                    notification
                });
            } else {
                logger.info(`📴 user:${data.userId} is offline`)
            }
        }
    } catch (error) {
        service.handleTypeormError(error);
    }
});


export default notification;