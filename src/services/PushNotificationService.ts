import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import logger from '../config/logger';

/**
 * Service to handle push notifications via Expo
 */
export default class PushNotificationService {
  private expo: Expo;

  constructor() {
    // Initialize Expo SDK
    this.expo = new Expo();
  }

  /**
   * Sends a push notification to a single device or multiple devices
   * @param pushTokens Array of Expo push tokens or a single token string
   * @param title Title of the notification
   * @param body Body content of the notification
   * @param data Optional data payload
   * @param sound Sound to play (e.g. 'default')
   */
  public async sendNotification(
    pushTokens: string | string[],
    title: string,
    body: string,
    data: any = {},
    sound: 'default' | null = 'default'
  ) {
    const tokens = Array.isArray(pushTokens) ? pushTokens : [pushTokens];
    const messages: ExpoPushMessage[] = [];

    for (const pushToken of tokens) {
      // Check that all your push tokens appear to be valid Expo push tokens
      if (!Expo.isExpoPushToken(pushToken)) {
        logger.error(`Push token ${pushToken} is not a valid Expo push token`);
        continue;
      }

      // Construct a message
      messages.push({
        to: pushToken,
        sound,
        title,
        body,
        data,
      });
    }

    // Batch the messages to send multiple at once
    let chunks = this.expo.chunkPushNotifications(messages);
    let tickets: ExpoPushTicket[] = [];

    for (let chunk of chunks) {
      try {
        let ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        // NOTE: If a ticket contains an error, it means the notification was not
        // successfully sent to Expo. You should handle these errors appropriately.
      } catch (error) {
        logger.error('Error sending push notification chunk:', error);
      }
    }

    // We can also check the receipts if needed, but for now we'll just log the tickets
    // to identify any immediate delivery issues.
    this.handleTickets(tickets);

    return tickets;
  }

  /**
   * Processes tickets returned from Expo to log errors
   */
  private handleTickets(tickets: ExpoPushTicket[]) {
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        logger.error(`Error sending notification: ${ticket.message}`);
        // If the error is DeviceNotRegistered, we should remove the token from our database
        if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
          logger.warn('Device not registered. Consider removing this token from DB.');
        }
      }
    }
  }
}
