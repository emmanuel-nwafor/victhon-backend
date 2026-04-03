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
    const eventType = QueueEvents.NOTIFICATION_NOTIFY;

    // We do NOT want to block the main thread/request for notification queuing.
    // This makes the app feel "seamless".
    const task = (async () => {
        try {
            console.log(`[NOTIFICATION_SERVICE] Queuing ${provider} notification for user ${data.userId}...`);
            await RabbitMQ.publishToExchange(queueName, eventType, {
                eventType: eventType,
                payload,
            });
            console.log(`[NOTIFICATION_SERVICE] Successfully queued ${provider} notification for ${data.userId}`);
        } catch (error) {
            console.error(`[NOTIFICATION_SERVICE] ERROR: Failed to publish notification to queue:`, error);
            // await Outbox.add(queueName, eventType, payload);
        }
    })();

    // Return the promise but the caller doesn't HAVE to await it for the UI to proceed
    // unless they specifically want to wait for the queueing to finish.
    return task;
}

export default notify;