import type { Expo as ExpoType, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import logger from '../config/logger';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { Professional } from '../entities/Professional';
import { UserType } from '../types/constants';

/**
 * Service to handle push notifications via Expo
 */
export default class PushNotificationService {
  private expo: ExpoType | null = null;
  private ExpoClass: any = null;

  /**
   * Lazily initializes the Expo SDK to handle ESM compatibility in CJS
   */
  private async getExpo() {
    if (!this.expo || !this.ExpoClass) {
      try {
        // Use dynamic import to avoid ERR_REQUIRE_ESM
        const sdk = await (eval('import("expo-server-sdk")') as Promise<typeof import('expo-server-sdk')>);
        this.ExpoClass = sdk.Expo;
        this.expo = new sdk.Expo();
      } catch (error) {
        logger.error('Failed to initialize Expo SDK:', error);
        throw error;
      }
    }
    return { expo: this.expo, Expo: this.ExpoClass };
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
    const { expo, Expo } = await this.getExpo();
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
    let chunks = expo.chunkPushNotifications(messages);
    let tickets: ExpoPushTicket[] = [];

    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        logger.error('Error sending push notification chunk:', error);
      }
    }

    this.handleTickets(tickets);

    return tickets;
  }

  /**
   * Sends a push notification to a specific user by their ID
   */
  public async sendToUser(
    userId: string,
    userType: UserType,
    title: string,
    body: string,
    data: any = {}
  ) {
    try {
      const repo = AppDataSource.getRepository(
        userType === UserType.PROFESSIONAL ? Professional : User
      );
      
      const user = await repo.findOne({ 
        where: { id: userId } as any,
        select: ['pushToken'] as any
      });

      if (!user || !user.pushToken) {
        logger.warn(`Push token not found for ${userType} ID: ${userId}`);
        return null;
      }

      return await this.sendNotification(user.pushToken, title, body, data);
    } catch (error) {
      logger.error(`Error in sendToUser for ${userType} ${userId}:`, error);
      return null;
    }
  }

  /**
   * Processes tickets returned from Expo to log errors
   */
  private handleTickets(tickets: ExpoPushTicket[]) {
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        logger.error(`Error sending notification: ${ticket.message}`);
        if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
          logger.warn('Device not registered. Consider removing this token from DB.');
        }
      }
    }
  }
}
