import { AppDataSource } from "../data-source";
import Service from "./Service";
import { Setting as SettingEntity } from "../entities/SettingEntity";
import { Professional } from "../entities/Professional";
import { User } from "../entities/User";
import { HttpStatus, UserType } from "../types/constants";

export default class SettingService extends Service {

    private readonly repo = AppDataSource.getRepository(SettingEntity);
    private readonly professionalRepo = AppDataSource.getRepository(Professional);
    private readonly userRepo = AppDataSource.getRepository(User);
 
    public async create(
        ownerId: string,
        ownerType: UserType
    ) {
        try {
            const ownerRepo = ownerType === UserType.PROFESSIONAL ? this.professionalRepo : this.userRepo;
            const owner = await (ownerRepo as any).findOne({
                where: { id: ownerId },
            });
 
            if (!owner) {
                return this.responseData(
                    HttpStatus.NOT_FOUND,
                    true,
                    `${ownerType === UserType.PROFESSIONAL ? 'Professional' : 'User'} was not found`
                );
            }
 
            const where = ownerType === UserType.PROFESSIONAL ? { professionalId: ownerId } : { userId: ownerId };
            const existing = await this.repo.findOne({ where });
 
            if (existing) {
                return this.responseData(
                    HttpStatus.BAD_REQUEST,
                    true,
                    "Settings already exist for this account"
                );
            }
 
            const setting = this.repo.create(where);
 
            const saved = await this.repo.save(setting);
 
            return this.responseData(
                HttpStatus.CREATED,
                false,
                "Settings were created successfully",
                saved
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
 
    public async get(
        ownerId: string,
        ownerType: UserType
    ) {
        try {
            const where = ownerType === UserType.PROFESSIONAL ? { professionalId: ownerId } : { userId: ownerId };
            let setting = await this.repo.findOne({ where });
 
            if (!setting) {
                // Auto-create if not found
                const createResult = await this.create(ownerId, ownerType);
                if (createResult.json.error) return createResult;
                setting = createResult.json.data;
            }
 
            return this.responseData(
                HttpStatus.OK,
                false,
                "Settings retrieved successfully",
                setting
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
 
    public async update(
        ownerId: string,
        ownerType: UserType,
        payload: Partial<{
            bookingRequestsEnabled: boolean;
            newMessagesEnabled: boolean;
            paymentReceivedEnabled: boolean;
            customerReviewsEnabled: boolean;
            biometricsEnabled: boolean;
        }>
    ) {
        try {
            const where = ownerType === UserType.PROFESSIONAL ? { professionalId: ownerId } : { userId: ownerId };
            const setting = await this.repo.findOne({ where });
 
            if (!setting) {
                return this.responseData(
                    HttpStatus.NOT_FOUND,
                    true,
                    "Settings not found"
                );
            }
 
            Object.assign(setting, payload);
 
            const updated = await this.repo.save(setting);
 
            return this.responseData(
                HttpStatus.OK,
                false,
                "Settings updated successfully",
                updated
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
 
    public async delete(
        ownerId: string,
        ownerType: UserType
    ) {
        try {
            const where = ownerType === UserType.PROFESSIONAL ? { professionalId: ownerId } : { userId: ownerId };
            const setting = await this.repo.findOne({ where });
 
            if (!setting) {
                return this.responseData(
                    HttpStatus.NOT_FOUND,
                    true,
                    "Settings not found"
                );
            }
 
            await this.repo.remove(setting);
 
            return this.responseData(
                HttpStatus.OK,
                false,
                "Settings deleted successfully"
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
}
