import express, { Router } from 'express';
import asyncHandler from "express-async-handler";
import Controller from '../controllers/Payment';
import verifyJWT from "../middlewares/verifyJWT";
import { UserType } from "../types/constants";
import { initializeValidator, withdrawValidator } from "./../middlewares/routes/payment";

const paymentRouter = Router();

paymentRouter.get('/initialize/booking/:bookingId', initializeValidator, asyncHandler(Controller.initializeBookingPayment));
paymentRouter.get('/initialize/booking/refund/:bookingId', initializeValidator, asyncHandler(Controller.bookingRefund));
paymentRouter.get('/flw/callback', (req, res) => {
    res.send(`
        <html>
            <head><title>Processing Payment...</title></head>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background-color:#ffffff;">
                <h2 style="color:#003b14;">Payment completed. Redirecting to app...</h2>
            </body>
        </html>
    `);
});
paymentRouter.get('/verify/:reference',verifyJWT([UserType.USER]), asyncHandler(Controller.verifyFlwTransaction));
paymentRouter.post('/withdraw',withdrawValidator, asyncHandler(Controller.withdraw));


// paymentRouter.get('/booking/verify/:bookingId', initializeValidator, asyncHandler(verifyBookingTransaction));
paymentRouter.post('/webhook', express.raw({ type: 'application/json' }), asyncHandler(Controller.webhook));

export default paymentRouter;