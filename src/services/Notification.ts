import { AppDataSource } from "../data-source";
import Service from "./Service";
import { Notification as Entity } from "../entities/Notification";
import { UserType } from "../types/constants";


export default class Notification extends Service {

    private readonly repo = AppDataSource.getRepository(Entity);

    public async create(data: any) {
        try {
            const query = await this.repo.create({
                userId: data.userId,
                type: data.type,
                data: data.data,

            })
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async notification(id: string, userId: string, userType: UserType) {
        try {
            const userQuery = userType == UserType.USER ? { userId: userId } : { professionalId: userId };
            const result = await this.repo.findOne({ where: { id, ...userQuery } });
            if (!result) return this.responseData(404, true, "Notification has was not found", result);
            return this.responseData(200, false, "Notification has been retrieved successfully", result);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async notifications(userId: string, userType: UserType, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;
            const userQuery = userType == UserType.USER ? { userId: userId } : { professionalId: userId };
            const [notifications, total] = await this.repo.findAndCount({
                where: userQuery,
                skip,
                take: limit,
                order: { createdAt: "DESC" },
            });

            const data = {
                records: notifications,
                pagination: this.pagination(page, limit, total),
            }

            return this.responseData(200, false, "Notifications have been retrieved successfully", data)
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async deleteNotification(id: string, userId: string, userType: UserType) {
        try {
            const userQuery = userType == UserType.USER ? { userId: userId } : { professionalId: userId };
            const notification = await this.repo.findOne({ where: { id, ...userQuery } });
            
            if (!notification) {
                return this.responseData(404, true, "Notification not found");
            }

            await this.repo.remove(notification);
            return this.responseData(200, false, "Notification deleted successfully");
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async deleteAllNotifications(userId: string, userType: UserType) {
        try {
            const userQuery = userType == UserType.USER ? { userId: userId } : { professionalId: userId };
            await this.repo.delete(userQuery);
            return this.responseData(200, false, "All notifications deleted successfully");
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
}