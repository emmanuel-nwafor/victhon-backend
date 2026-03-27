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
        default:
            return { title: "Victhon Update", body: "You have a new notification." };
    }
}

notification.route(QueueEvents.NOTIFICATION_NOTIFY, async (message: any, io: Server) => {
    const { payload: { provider, data } } = message;

    try {

        if (provider == "socket") {

            const userService = new UserService();
            const proService = new ProfessionalService();

            const socketId = data.userType == UserType.PROFESSIONAL ? await proService.getSocketId(data.userId) : await userService.getSocketId(data.userId);
            const repo = AppDataSource.getRepository(Notification);

            const userId = data.userType == UserType.PROFESSIONAL ? { professionalId: data.userId } : { userId: data.userId };
            
            const recipient = data.userType === UserType.PROFESSIONAL
                ? await AppDataSource.getRepository(ProfessionalEntity).findOne({ where: { id: data.userId } })
                : await AppDataSource.getRepository(UserEntity).findOne({ where: { id: data.userId } });

            const newNotification = repo.create({
                ...userId,
                type: data.type,
                data: data.data,
                userType: data.userType,
                status: socketId ? NotificationStatus.SENT : NotificationStatus.PENDING
            });

            const savedNotification = await repo.save(newNotification);

            if (socketId) {
                logger.info(`🏃 Notifying ${data.userType}:${data.userId}, notification type:${data.type}`)

                const notificationNamespace = io.of(Namespaces.BASE);
                notificationNamespace.to(socketId).emit("notification", { notification: savedNotification });
            } else {
                logger.info(`📴 user:${data.userId} is offline`)
            }

            // Send Push Notification if token exists
            if (recipient?.pushToken) {
                const { title, body } = getNotificationContent(data.type, data.data);
                logger.info(`📱 Sending push notification to ${data.userId}: ${title}`);
                await pushService.sendNotification(recipient.pushToken, title, body, {
                    notificationId: savedNotification.id,
                    type: data.type,
                });
            }
        }
    } catch (error) {
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