import { Request, Response } from "express";
import Controller from "./Controller";
import Service from "../services/Booking";
import Cloudinary from "../services/Cloudinary";
import { CdnFolders, ResourceType } from "../types/constants";


export default class Booking {

    private static service = new Service();

    public static async book(req: Request, res: Response) {
        const { id: userId } = res.locals.data;

        const serviceResult = await Booking.service.createBooking({
            ...req.body,
            userId: userId,
            startDateTime: new Date(req.body.startDateTime), // Monday
            endDateTime: new Date(req.body.endDateTime),
        });

        Controller.response(res, serviceResult);
    }

    public static async acceptBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.acceptBooking(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async rejectBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.rejectBooking(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async completeBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.completeBooking(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async startMoving(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.startMoving(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async reviewBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.reviewBooking(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async cancelBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.cancelBooking(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async getProBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.getProBooking(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async getProBookings(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        let { page, limit, status } = req.query;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;


        const serviceResult = await Booking.service.getProBookings(userId, parsedPage, parsedLimit, status as string);

        Controller.response(res, serviceResult);
    }

    public static async getUserBookings(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        let { page, limit } = req.query;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;


        const serviceResult = await Booking.service.getUserBookings(userId, parsedPage, parsedLimit);

        Controller.response(res, serviceResult);
    }

    public static async bookings(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        let { page, limit } = req.query;
        const { professionalId } = req.params;

        const parsedPage = parseInt(page as string) || 1;
        const parsedLimit = parseInt(limit as string) || 10;


        const serviceResult = await Booking.service.bookings(professionalId!, parsedPage, parsedLimit);

        Controller.response(res, serviceResult);
    }

    public static async getUserBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;

        const serviceResult = await Booking.service.getUserBooking(bookingId!, userId);

        Controller.response(res, serviceResult);
    }

    public static async disputeBooking(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;
        const { reason } = req.body;
        const files = req.files as Express.Multer.File[];

        let evidenceUrls: string[] = [];

        if (files && files.length > 0) {
            const cloudinary = new Cloudinary();
            const { uploadedFiles, failedFiles } = await cloudinary.uploadV2(
                files,
                ResourceType.IMAGE,
                CdnFolders.DISPUTES
            );

            if (failedFiles.length > 0) {
                return Controller.response(res, {
                    statusCode: 500,
                    json: {
                        error: true,
                        message: "Some evidence files failed to upload",
                        data: failedFiles
                    }
                });
            }

            evidenceUrls = uploadedFiles.map(file => file.url);
        }

        const serviceResult = await Booking.service.disputeBooking(bookingId!, userId, reason, evidenceUrls);

        Controller.response(res, serviceResult);
    }

}