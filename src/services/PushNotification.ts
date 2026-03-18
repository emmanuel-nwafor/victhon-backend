import logger from '../config/logger';

export default class PushNotificationService {
    private expo: any; // Using any because types are loaded dynamically

    constructor() {
        // We will initialize this inside the methods to ensure the module is loaded
        this.expo = null;
    }

    /**
     * Helper to ensure Expo is loaded dynamically
     */
    private async getExpoClient() {
        if (!this.expo) {
            const { Expo } = await import('expo-server-sdk');
            this.expo = new Expo();
        }
        return this.expo;
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
        const { Expo } = await import('expo-server-sdk');
        const expoClient = await this.getExpoClient();

        if (!Expo.isExpoPushToken(pushToken)) {
            logger.error(`Push token ${pushToken} is not a valid Expo push token`);
            return;
        }

        const messages: any[] = [{
            to: pushToken,
            sound: 'default',
            title,
            body,
            data,
        }];

        try {
            const chunks = expoClient.chunkPushNotifications(messages);
            const tickets = [];
            for (const chunk of chunks) {
                try {
                    const ticketChunk = await expoClient.sendPushNotificationsAsync(chunk);
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
        const { Expo } = await import('expo-server-sdk');
        const expoClient = await this.getExpoClient();

        const messages: any[] = [];
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

        const chunks = expoClient.chunkPushNotifications(messages);
        const tickets = [];
        for (const chunk of chunks) {
            try {
                const ticketChunk = await expoClient.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                logger.error('Error sending push notification chunk:', error);
            }
        }
        return tickets;
    }
}