import { Request, Response } from "express";
import Controller from "./Controller";
import Service from "../services/Professional";
import { EditProfessionalDto, SetupBusinessProfileDto } from "../types";


export default class Professional {

    private static service = new Service();

    public static async profile(req: Request, res: Response) {
        const { id: userId } = res.locals.data;

        const serviceResult = await Professional.service.profile(userId);
        Controller.response(res, serviceResult);
    }

    public static async editProfessionalProfile(req: Request, res: Response) {
        let editData: EditProfessionalDto = req.body;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        editData.file = files?.image?.[0];
        editData.businessLogo = files?.businessLogo?.[0];
        const { id: userId } = res.locals.data;

        const serviceResult = await Professional.service.editProfessionalProfile(userId, editData);
        Controller.response(res, serviceResult);
    }

    public static async setupBusinessProfile(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

        const dto: SetupBusinessProfileDto = {
            businessName: req.body.businessName,
            businessCategory: req.body.businessCategory,
            businessType: req.body.businessType,
            ninNumber: req.body.ninNumber,
            logo: files?.logo?.[0],
            ninSlip: files?.ninSlip?.[0],
        };

        const serviceResult = await Professional.service.setupBusinessProfile(userId, dto);
        Controller.response(res, serviceResult);
    }

    public static async savePushToken(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { pushToken } = req.body;

        const serviceResult = await Professional.service.savePushToken(userId, pushToken);
        Controller.response(res, serviceResult);
    }

    public static async updateAvailability(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { availability } = req.body;

        const serviceResult = await Professional.service.updateAvailability(userId, availability);
        Controller.response(res, serviceResult);
    }

    /* --- Schedule Management --- */
    private static scheduleService = new (require("../services/Schedule").default)();

    public static async getSchedule(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { page, limit } = req.query;
        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 50; // Higher default for schedule

        const result = await Professional.scheduleService.schedules(userId, parsedPage, parsedLimit);
        Controller.response(res, result);
    }

    public static async createSchedule(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { dayOfWeek, startTime, endTime, isActive } = req.body;

        const result = await Professional.scheduleService.createSchedule(userId, dayOfWeek, startTime, endTime, isActive);
        Controller.response(res, result);
    }

    public static async createSchedules(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        // Bulk add
        const result = await Professional.scheduleService.createSchedules(userId, req.body.schedules || req.body);
        Controller.response(res, result);
    }
}