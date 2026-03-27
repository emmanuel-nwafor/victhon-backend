import { RabbitMQ } from "./RabbitMQ";
import { QueueEvents, QueueNames } from "../types/constants";
// import Outbox from "./Outbox";

export enum NotificationProvider {
    Email = "email",
    SOCKET = "socket",
    PUSH = "push"
}

async function notify(data: any, provider: NotificationProvider = NotificationProvider.SOCKET) {
    const payload = { data, provider };
    const queueName = QueueNames.NOTIFICATION;
    const eventType = QueueEvents.NOTIFICATION_NOTIFY
    try {
        await RabbitMQ.publishToExchange(queueName, eventType, {
            eventType: eventType,
            payload,
        });
    } catch (error) {
        console.log("Failed to publish notification: ", error);
        // await Outbox.add(queueName, eventType, payload);
    }
}

export default notify;