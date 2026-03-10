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

    // Renamed from verifyPaystackTransaction / verifyPayazaTransaction → verifyFlwTransaction
    //
    // The frontend calls this after Flutterwave redirects back with:
    //   ?status=successful&tx_ref=booking_xxx&transaction_id=12345678
    //
    // Pass the transaction_id (numeric) from the query params as :transactionId
    // Route: GET /payment/verify/:transactionId
    public static async verifyFlwTransaction(req: Request, res: Response) {
        const { transactionId } = req.params;
        const serviceResult = await Payment.service.verifyFlwTransactionService(transactionId!);
        Controller.response(res, serviceResult);
    }

    public static async withdraw(req: Request, res: Response) {
        const { id: userId } = res.locals.data;
        const { accountId, amount } = req.body;
        const parsedAmount = parseFloat(amount) || null;

        if (!parsedAmount) {
            res.status(400).send({ error: true, message: 'Amount must be valid', data: {} });
            return;
        }
        const serviceResult = await Payment.service.withdraw(userId, accountId, parsedAmount);
        Controller.response(res, serviceResult);
    }

    public static async webhook(req: Request, res: Response) {
        // Flutterwave sends a plain string in 'verif-hash' header
        // (set on your Flutterwave Dashboard → Settings → Webhooks → "Secret hash")
        // This is NOT an HMAC — it's a direct string you define yourself
        const signature = req.headers['verif-hash'];

        const serviceResult = await Payment.service.webhook((req as any).rawBody, signature);
        res.status(serviceResult.statusCode).send(serviceResult.json.message);
        return;
    }
}