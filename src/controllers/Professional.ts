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
}