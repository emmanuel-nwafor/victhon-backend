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
        console.log('[PUSH_SERVICE] Initializing Expo SDK...');
        // Use dynamic import to avoid ERR_REQUIRE_ESM
        const sdk = await (eval('import("expo-server-sdk")') as Promise<typeof import('expo-server-sdk')>);
        this.ExpoClass = sdk.Expo;
        this.expo = new sdk.Expo();
        console.log('[PUSH_SERVICE] Expo SDK initialized successfully.');
      } catch (error) {
        logger.error('[PUSH_SERVICE] Failed to initialize Expo SDK:', error);
        console.error('[PUSH_SERVICE] ERROR: Failed to initialize Expo SDK. Push notifications will NOT work.', error);
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
        logger.error(`[PUSH_SERVICE] ❌ Invalid Expo push token: ${pushToken}`);
        console.error(`[PUSH_SERVICE] ❌ Invalid Expo push token: ${pushToken}`);
        continue;
      }

      // Construct a message
      messages.push({
        to: pushToken,
        sound,
        title,
        body,
        data,
        channelId: 'alerts',
        priority: 'high',
      });
    }

    console.log(`[PUSH_SERVICE] Preparing to send ${messages.length} notifications...`);

    // Batch the messages to send multiple at once
    let chunks = expo.chunkPushNotifications(messages);
    let tickets: ExpoPushTicket[] = [];

    for (let chunk of chunks) {
      try {
        console.log(`[PUSH_SERVICE] 📡 Sending chunk of ${chunk.length} messages to Expo...`);
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log(`[PUSH_SERVICE] ✅ Received ${ticketChunk.length} tickets from Expo.`);
        tickets.push(...ticketChunk);
      } catch (error) {
        logger.error('[PUSH_SERVICE] ❌ Error sending push notification chunk:', error);
        console.error('[PUSH_SERVICE] ❌ ERROR: Failed to send push chunk to Expo server:', error);
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
      console.log(`[PUSH_SERVICE] Fetching pushToken for ${userType} ID: ${userId}`);
      const repo = AppDataSource.getRepository(
        userType === UserType.PROFESSIONAL ? Professional : User
      );
      
      const recipient = await repo.findOne({ 
        where: { id: userId } as any,
        select: ['pushToken', 'email'] as any
      });

      if (!recipient?.pushToken) {
        logger.warn(`[PUSH_SERVICE] Push token not found for ${userType} ID: ${userId} (${recipient?.email || 'unknown email'})`);
        console.log(`❌ [PUSH_SERVICE] No pushToken found for ${userType} (${recipient?.email || userId})`);
        return null;
      }

      console.log(`✅ [PUSH_SERVICE] Found pushToken for ${userType} (${recipient.email}): ${recipient.pushToken.substring(0, 15)}...`);

      return await this.sendNotification(recipient.pushToken, title, body, data);
    } catch (error) {
      logger.error(`[PUSH_SERVICE] Error in sendToUser for ${userType} ${userId}:`, error);
      console.error(`❌ [PUSH_SERVICE] Fatal error sending to user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Processes tickets returned from Expo to log errors
   */
  private handleTickets(tickets: ExpoPushTicket[]) {
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        logger.error(`❌ [PUSH_SERVICE] Error sending notification: ${ticket.message}`);
        console.error(`❌ [PUSH_SERVICE] Ticket error: ${ticket.message}`);
        if (ticket.details) {
          logger.error(`❌ [PUSH_SERVICE] Ticket error details: ${JSON.stringify(ticket.details)}`);
          if ((ticket.details as any).error === 'DeviceNotRegistered') {
            logger.warn('⚠️ [PUSH_SERVICE] Device not registered. Consider removing this token from DB.');
            console.log('⚠️ [PUSH_SERVICE] DeviceNotRegistered: This token is no longer valid.');
          }
        }
      } else {
        logger.info(`✅ [PUSH_SERVICE] Notification delivered to Expo. Ticket ID: ${ticket.id}`);
        console.log(`✅ [PUSH_SERVICE] Notification queued at Expo. Ticket ID: ${ticket.id}`);
      }
    }
  }
}
