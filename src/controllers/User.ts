import { Request, Response } from "express";
import Controller from "./Controller";
import Service from "../services/User";
import {EditProfessionalDto, EditUserDto} from "../types";


export default class User {

    private static service = new Service();

    public static async profile(req: Request, res: Response) {
        const { id: userId } = res.locals.data;

        const serviceResult = await User.service.profile(userId);
        Controller.response(res, serviceResult);
    }

    public static async uploadProfilePicture(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { publicId, url } = req.body;

        const serviceResult = await User.service.uploadProfilePicture(userId, publicId, url);
        Controller.response(res, serviceResult);
    }

    public static async editUserProfile(req: Request, res: Response) {
        let editData: EditUserDto = req.body;
        editData.file = req.file;
        const { id: userId } = res.locals.data;

        const serviceResult = await User.service.editUserProfile(userId, editData);
        Controller.response(res, serviceResult);
    }

    public static async savePushToken(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { pushToken } = req.body;

        const serviceResult = await User.service.savePushToken(userId, pushToken);
        Controller.response(res, serviceResult);
    }
}