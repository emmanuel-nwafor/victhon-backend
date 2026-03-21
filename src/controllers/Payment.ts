import { Request, Response } from "express";
import Service from "../services/Payment";
import Controller from "./Controller";

export default class Payment {

    private static service: Service = new Service();

    public static async initializeBookingPayment(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;
        const serviceResult = await Payment.service.initializeBookingPayment(bookingId!, userId);
        Controller.response(res, serviceResult);
    }

    public static async bookingRefund(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { bookingId } = req.params;
        const serviceResult = await Payment.service.refundBooking(bookingId!, userId);
        Controller.response(res, serviceResult);
    }

    public static async verifyFlwTransaction(req: Request, res: Response) {
        const { reference } = req.params;
        const serviceResult = await Payment.service.verifyFlwTransactionService(reference!);
        Controller.response(res, serviceResult);
    }

    public static async withdraw(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { accountId, amount, bankCode, accountNumber, accountName } = req.body;
        const parsedAmount = parseFloat(amount) || null;

        if (!parsedAmount) {
            res.status(400).send({ error: true, message: 'Amount must be valid', data: {} });
            return;
        }

        const accountDetails = (bankCode && accountNumber) ? { bankCode, accountNumber, accountName } : undefined;
        const serviceResult = await Payment.service.withdraw(userId, accountId, parsedAmount, accountDetails);
        Controller.response(res, serviceResult);
    }

    public static async webhook(req: Request, res: Response) {
        const signature = req.headers['verif-hash'];

        const serviceResult = await Payment.service.webhook((req as any).rawBody, signature);
        res.status(serviceResult.statusCode).send(serviceResult.json.message);
        return;
    }
}