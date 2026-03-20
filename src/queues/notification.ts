import { Server } from "socket.io";
import RabbitMQRouter from "../utils/RabbitMQRouter";
import { Namespaces, QueueEvents, QueueNames, UserType } from "../types/constants";
import { Notification, NotificationStatus } from "../entities/Notification";
import BaseService from "../services/Service";
import logger from "../config/logger";
import UserService from "../services/User";
import { User as UserEntity } from "../entities/User";
import { Professional as ProfessionalEntity } from "../entities/Professional";
import ProfessionalService from "../services/Professional";
import { exchange } from "../types";
import { AppDataSource } from "../data-source";


const notification = new RabbitMQRouter({
    name: QueueNames.NOTIFICATION,
    durable: true,
    routingKeyPattern: 'notification.*',
    exchange: exchange,
    handlers: {}
});

const service = new BaseService();

notification.route(QueueEvents.NOTIFICATION_NOTIFY, async (message: any, io: Server) => {
    const { payload: { provider, data } } = message;

    try {

        if (provider == "socket") {

            const userService = new UserService();
            const proService = new ProfessionalService();

            const socketId = data.userType == UserType.PROFESSIONAL ? await proService.getSocketId(data.userId) : await userService.getSocketId(data.userId);
            const repo = AppDataSource.getRepository(Notification);

            const userId = data.userType == UserType.PROFESSIONAL ? { professionalId: data.userId } : { userId: data.userId };
            const newNotification = repo.create({
                ...userId,
                type: data.type,
                data: data.data,
                userType: data.userType,
                status: socketId ? NotificationStatus.SENT : NotificationStatus.PENDING
            });

            const notification = await repo.save(newNotification);

            const recipient = data.userType === UserType.PROFESSIONAL
                ? await AppDataSource.getRepository(ProfessionalEntity).findOne({ where: { id: data.userId } })
                : await AppDataSource.getRepository(UserEntity).findOne({ where: { id: data.userId } });

            if (socketId) {
                logger.info(`🏃 Notifying ${data.userType}:${data.userId}, notification type:${data.type}`)

                const notificationNamespace = io.of(Namespaces.BASE);
                notificationNamespace.to(socketId).emit("notification", { notification });
            } else {
                logger.info(`📴 user:${data.userId} is offline`)
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