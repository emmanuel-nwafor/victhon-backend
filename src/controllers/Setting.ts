import { Request, Response } from "express";
import Controller from "./Controller";
import SettingService from "../services/Setting";

export default class Setting {

    private static service = new SettingService();

    public static async create(req: Request, res: Response) {
        const { id: ownerId, userType } = res.locals.data;
 
        const serviceResult =
            await Setting.service.create(ownerId, userType);
 
        Controller.response(res, serviceResult);
    }
 
    public static async get(req: Request, res: Response) {
        const { id: ownerId, userType } = res.locals.data;
 
        const serviceResult =
            await Setting.service.get(ownerId, userType);
 
        Controller.response(res, serviceResult);
    }
 
    public static async update(req: Request, res: Response) {
        const { id: ownerId, userType } = res.locals.data;
 
        const {
            bookingRequestsEnabled,
            newMessagesEnabled,
            paymentReceivedEnabled,
            customerReviewsEnabled,
            biometricsEnabled,
        } = req.body;
 
        const serviceResult =
            await Setting.service.update(ownerId, userType, {
                bookingRequestsEnabled,
                newMessagesEnabled,
                paymentReceivedEnabled,
                customerReviewsEnabled,
                biometricsEnabled,
            });
 
        Controller.response(res, serviceResult);
    }
 
    public static async delete(req: Request, res: Response) {
        const { id: ownerId, userType } = res.locals.data;
 
        const serviceResult =
            await Setting.service.delete(ownerId, userType);
 
        Controller.response(res, serviceResult);
    }
}
