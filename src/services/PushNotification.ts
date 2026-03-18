import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import logger from '../config/logger';

export default class PushNotificationService {
    private expo: Expo;

    constructor() {
        this.expo = new Expo();
    }

    /**
     * Send a push notification to a specific token.
     */
    public async sendNotification(
        pushToken: string,
        title: string,
        body: string,
        data: any = {}
    ) {
        if (!Expo.isExpoPushToken(pushToken)) {
            logger.error(`Push token ${pushToken} is not a valid Expo push token`);
            return;
        }

        const messages: ExpoPushMessage[] = [{
            to: pushToken,
            sound: 'default',
            title,
            body,
            data,
        }];

        try {
            const chunks = this.expo.chunkPushNotifications(messages);
            const tickets = [];
            for (const chunk of chunks) {
                try {
                    const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
                    tickets.push(...ticketChunk);
                } catch (error) {
                    logger.error('Error sending push notification chunk:', error);
                }
            }
            return tickets;
        } catch (error) {
            logger.error('Error sending push notification:', error);
            throw error;
        }
    }

    /**
     * Send notifications to multiple tokens.
     */
    public async sendMultipleNotifications(
        notifications: { pushToken: string; title: string; body: string; data?: any }[]
    ) {
        const messages: ExpoPushMessage[] = [];
        for (const n of notifications) {
            if (Expo.isExpoPushToken(n.pushToken)) {
                messages.push({
                    to: n.pushToken,
                    sound: 'default',
                    title: n.title,
                    body: n.body,
                    data: n.data || {},
                });
            } else {
                logger.error(`Push token ${n.pushToken} is not a valid Expo push token`);
            }
        }

        const chunks = this.expo.chunkPushNotifications(messages);
        const tickets = [];
        for (const chunk of chunks) {
            try {
                const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                logger.error('Error sending push notification chunk:', error);
            }
        }
        return tickets;
    }
}
