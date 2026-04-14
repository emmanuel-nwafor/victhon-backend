import {Request, Response} from "express";
import Controller from "./Controller";
import Service from "../services/Chat";


export default class Chat {

    private static service = new Service();


    public static async create(req: Request, res: Response): Promise<void> {
        const {professionalId, userId} = req.body;

        const serviceResult = await Chat.service.createChat(userId, professionalId);

        Controller.response(res, serviceResult);
    }

    public static async sendAttachment(req: Request, res: Response): Promise<void> {
        const {senderId, senderType, content} = req.body;
        const {chatId} = req.params;

        const files = req.files as Express.Multer.File[];
        const MAX_SIZE = 1.5 * 1024 * 1024; // 1.5 MB

        if (files) {
            for (const file of files) {
                if (file.size > MAX_SIZE) {
                    const deleteFiles = require("../utils/deleteFiles").default;
                    await deleteFiles(files);
                    res.status(400).json({ error: true, message: `File ${file.originalname} exceeds the 1.5MB limit.` });
                    return;
                }
            }
        }

        const serviceResult = await Chat.service.sendAttachment(
            senderId,
            senderType,
            chatId!,
            content ?? null,
            files);

        Controller.response(res, serviceResult);
    }

    public static async getMessages(req: Request, res: Response): Promise<void> {
        const {id: userId, userType} = res.locals.data;
        let {page, limit} = req.query;
        const {chatId} = req.params;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;


        const serviceResult = await Chat.service.getMessages(userId, userType, chatId!, parsedPage, parsedLimit);

        Controller.response(res, serviceResult);
    }

    public static async getChat(req: Request, res: Response): Promise<void> {
        const {id: userId, userType} = res.locals.data;
        const {chatId} = req.params;

        const serviceResult = await Chat.service.getChat(userId, userType, chatId!);

        Controller.response(res, serviceResult);
    }

    public static async getChats(req: Request, res: Response): Promise<void> {
        const {id: userId, userType} = res.locals.data;
        let {page, limit} = req.query;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;


        const serviceResult = await Chat.service.getChats(userId, userType, parsedPage, parsedLimit);

        Controller.response(res, serviceResult);
    }

}