import { LessThan } from "typeorm";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Notification, NotificationPriority, NotificationStatus, NotificationType } from "../entities/Notification";
import { UserType } from "../types/constants";
import PushNotificationService from "./PushNotificationService";
import Email from "./Email";
import logger from "../config/logger";

export default class PromotionalNotificationService {
  private pushService: PushNotificationService;
  private emailService: Email;

  constructor() {
    this.pushService = new PushNotificationService();
    this.emailService = new Email();
  }

  /**
   * Sends re-engagement push notification AND email to inactive users.
   * Targets users who have been inactive for more than `inactiveDays` (default 7 days).
   */
  public async sendInactiveUserReminders(inactiveDays: number = 7) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const notificationRepo = AppDataSource.getRepository(Notification);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

      // Find active users whose updatedAt is older than the cutoff date
      const inactiveUsers = await userRepo.find({
        where: {
          isActive: true,
          updatedAt: LessThan(cutoffDate),
        },
        take: 200, // Batch limit
      });

      logger.info(`[Promotional] Found ${inactiveUsers.length} inactive users (>${inactiveDays} days)`);

      let pushSent = 0;
      let emailSent = 0;

      for (const user of inactiveUsers) {
        try {
          // Check if we already sent a re-engagement notification in the last 7 days
          const recentNotification = await notificationRepo
            .createQueryBuilder("n")
            .where("n.userId = :userId", { userId: user.id })
            .andWhere("n.type = :type", { type: NotificationType.SYSTEM })
            .andWhere("n.createdAt >= :cutoff", { cutoff: cutoffDate })
            .getOne();

          if (recentNotification) {
            continue; // Prevent spamming within the same cycle
          }

          // 1. Send Push Notification if user has pushToken
          if (user.pushToken) {
            await this.pushService.sendNotification(
              user.pushToken,
              "It's been a while, Victhon misses you! 👋",
              "Need help with home repairs, cleaning, or maintenance? Verified pros are ready to help, fully secured by Escrow.",
              {
                type: "promotional_miss_you",
                screen: "/screens/customers/(tabs)/services",
              }
            );
            pushSent++;
          }

          // 2. Send Re-engagement Email
          if (user.email) {
            await this.emailService.sendMissYouEmail(user.email, user.firstName);
            emailSent++;
          }

          // 3. Persist notification in system records
          const record = notificationRepo.create({
            userId: user.id,
            userType: UserType.USER,
            type: NotificationType.SYSTEM,
            priority: NotificationPriority.NORMAL,
            status: NotificationStatus.SENT,
            data: {
              title: "It's been a while, Victhon misses you! 👋",
              body: "Verified professionals near you are ready to help with your projects, protected by Escrow.",
              screen: "/screens/customers/(tabs)/services",
            },
          });
          await notificationRepo.save(record);
        } catch (itemErr) {
          logger.warn(`[Promotional] Failed to notify inactive user ${user.id}:`, itemErr);
        }
      }

      logger.info(`[Promotional] Inactive reminders sent: ${pushSent} pushes, ${emailSent} emails`);
      return { success: true, processed: inactiveUsers.length, pushSent, emailSent };
    } catch (error) {
      logger.error("[Promotional] Error running inactive user reminders:", error);
      return { success: false, error: (error as any)?.message };
    }
  }

  /**
   * Sends discovery push notification to active customers.
   * E.g. "Discover service providers near you"
   */
  public async sendDiscoverNearbyProviders() {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const notificationRepo = AppDataSource.getRepository(Notification);

      // Fetch active users with push tokens
      const activeUsers = await userRepo
        .createQueryBuilder("u")
        .where("u.isActive = :isActive", { isActive: true })
        .andWhere("u.pushToken IS NOT NULL AND u.pushToken != ''")
        .orderBy("u.updatedAt", "DESC")
        .take(200)
        .getMany();

      logger.info(`[Promotional] Found ${activeUsers.length} users with push tokens for discovery campaign`);

      let pushSent = 0;
      const title = "Discover service providers near you 🔍";
      const body = "Looking for top-rated experts in your neighborhood? Explore verified professionals ready to deliver quality work today.";

      for (const user of activeUsers) {
        try {
          await this.pushService.sendNotification(user.pushToken, title, body, {
            type: "promotional_discover",
            screen: "/screens/customers/(tabs)/services",
          });
          pushSent++;

          const record = notificationRepo.create({
            userId: user.id,
            userType: UserType.USER,
            type: NotificationType.SYSTEM,
            priority: NotificationPriority.NORMAL,
            status: NotificationStatus.SENT,
            data: {
              title,
              body,
              screen: "/screens/customers/(tabs)/services",
            },
          });
          await notificationRepo.save(record);
        } catch (itemErr) {
          logger.warn(`[Promotional] Failed to send discovery push to user ${user.id}:`, itemErr);
        }
      }

      logger.info(`[Promotional] Discovery campaign sent to ${pushSent} devices`);
      return { success: true, pushSent };
    } catch (error) {
      logger.error("[Promotional] Error sending discovery campaign:", error);
      return { success: false, error: (error as any)?.message };
    }
  }
}
