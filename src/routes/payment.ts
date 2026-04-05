import express, { Router } from 'express';
import asyncHandler from "express-async-handler";
import Controller from '../controllers/Payment';
import verifyJWT from "../middlewares/verifyJWT";
import { UserType } from "../types/constants";
import { initializeValidator, withdrawValidator, setupPinValidator, resolveAccountValidator } from "./../middlewares/routes/payment";

const paymentRouter = Router();

paymentRouter.get('/initialize/booking/:bookingId', initializeValidator, asyncHandler(Controller.initializeBookingPayment));
paymentRouter.get('/initialize/booking/refund/:bookingId', initializeValidator, asyncHandler(Controller.bookingRefund));
paymentRouter.get('/flw/callback', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Processing Payment...</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background-color:#ffffff;margin:0;padding:20px;text-align:center;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #003b14; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
                <h2 style="color:#003b14;margin:0;">Payment Processing...</h2>
                <p style="color:#666;margin-top:10px;">Please do not close this page. You will be redirected automatically.</p>
                <style>
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
                <script>
                    // Small delay to ensure the webview listener catches the URL with params
                    setTimeout(() => {
                        console.log("Payment finished, waiting for app to take over...");
                    }, 1000);
                </script>
            </body>
        </html>
    `);
});
paymentRouter.get('/verify/:reference', verifyJWT([UserType.USER]), asyncHandler(Controller.verifyFlwTransaction));
paymentRouter.post('/withdraw', withdrawValidator, asyncHandler(Controller.withdraw));

paymentRouter.get('/banks', asyncHandler(Controller.getBanks));
paymentRouter.get('/has-pin', verifyJWT([UserType.PROFESSIONAL]), asyncHandler(Controller.getHasPin));
paymentRouter.post('/resolve-account', resolveAccountValidator, asyncHandler(Controller.resolveAccount));
paymentRouter.post('/setup-pin', setupPinValidator, asyncHandler(Controller.setupPin));
paymentRouter.post('/change-pin', setupPinValidator, verifyJWT([UserType.PROFESSIONAL]), asyncHandler(Controller.changePin));


// paymentRouter.get('/booking/verify/:bookingId', initializeValidator, asyncHandler(verifyBookingTransaction));
paymentRouter.post('/webhook', express.raw({ type: 'application/json' }), asyncHandler(Controller.webhook));

export default paymentRouter;