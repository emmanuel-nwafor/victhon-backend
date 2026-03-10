import express, { Router } from 'express';
import asyncHandler from "express-async-handler";
import Controller from '../controllers/Payment';
import verifyJWT from "../middlewares/verifyJWT";
import { UserType } from "../types/constants";
import { initializeValidator, withdrawValidator } from "./../middlewares/routes/payment";

const paymentRouter = Router();

paymentRouter.get('/initialize/booking/:bookingId', initializeValidator, asyncHandler(Controller.initializeBookingPayment));
paymentRouter.get('/initialize/booking/refund/:bookingId', initializeValidator, asyncHandler(Controller.bookingRefund));
paymentRouter.get('/verify/:reference',verifyJWT([UserType.USER]), asyncHandler(Controller.verifyFlwTransaction));
paymentRouter.post('/withdraw',withdrawValidator, asyncHandler(Controller.withdraw));


// paymentRouter.get('/booking/verify/:bookingId', initializeValidator, asyncHandler(verifyBookingTransaction));
paymentRouter.post('/webhook', express.raw({ type: 'application/json' }), asyncHandler(Controller.webhook));

export default paymentRouter;