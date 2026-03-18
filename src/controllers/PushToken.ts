import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Professional } from "../entities/Professional";
import { UserType } from "../types/constants";
import BaseService from "../services/Service";

export default class PushTokenController extends BaseService {
    public async saveToken(req: Request, res: Response) {
        const { pushToken } = req.body;
        const { id } = res.locals.data;
        const type = res.locals.userType;

        if (!pushToken) {
            res.status(400).json(this.responseData(400, true, "Push token is required"));
            return;
        }

        try {
            if (type === UserType.USER) {
                const repo = AppDataSource.getRepository(User);
                await repo.update(id, { pushToken });
            } else if (type === UserType.PROFESSIONAL) {
                const repo = AppDataSource.getRepository(Professional);
                await repo.update(id, { pushToken });
            }

            res.status(200).json(this.responseData(200, false, "Push token saved successfully"));
        } catch (error) {
            this.handleTypeormError(error);
        }
    }
}
