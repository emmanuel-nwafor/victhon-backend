import {Server} from "socket.io";
import RabbitMQRouter from "../utils/RabbitMQRouter";
import notify from "../services/notify";
import BaseService from "../services/Service";
import {QueueEvents, QueueNames} from "../types/constants";
import {exchange} from "../types";
import logger from "../config/logger";
import {UserType} from "../types/constants";
import Payment from "../services/Payment";
import {NotificationType} from "../entities/Notification";
import {AppDataSource} from "../data-source";
import {Transaction} from "../entities/Transaction";
import { Booking } from "../entities/Booking";
import Email from "../services/Email";
import Chat from "../services/Chat";

const service = new BaseService();

const payment = new RabbitMQRouter({
    name: QueueNames.PAYMENT,
    durable: true,
    routingKeyPattern: 'payment.*',
    exchange: exchange,
    handlers: {}
});

payment.route(QueueEvents.PAYMENT_CHARGE_SUCCESSFUL, async (message: any, io: Server) => {
    const {payload: {data}} = message;
    const paymentService = new Payment();
    await paymentService.successfulCharge(data);
    logger.info(`Payment was completed for transaction:${data.metadata.transactionId}`);
});

payment.route(QueueEvents.PAYMENT_REFUND_SUCCESSFUL, async (message: any, io: Server) => {
    const {payload: {reference}} = message;
    const paymentService = new Payment();
    await paymentService.refundSuccessful(reference);
});

payment.route(QueueEvents.PAYMENT_REFUND_FAILED, async (message: any, io: Server) => {
    const {payload: {reference}} = message;
    const paymentService = new Payment();
    await paymentService.refundFailed(reference);
});

payment.route(QueueEvents.PAYMENT_BOOK_SUCCESSFUL, async (message: any, io: Server) => {
    const {payload: {transactionId, professionalId}} = message;

    try {
        const transactionRepo = AppDataSource.getRepository(Transaction);
        const bookingRepo = AppDataSource.getRepository(Booking);

        const result = await transactionRepo.findOne({
            where: {id: transactionId},
            relations: ["escrow", "escrow.booking"]
        });

        if (result && result.escrow && result.escrow.booking) {
            const bookingId = result.escrow.booking.id;
            const detailedBooking = await bookingRepo.findOne({
                where: { id: bookingId },
                relations: ["user", "professional", "services"]
            });

            if (detailedBooking) {
                const emailService = new Email();
                await emailService.sendBookingReceipt(
                    detailedBooking.user.email,
                    detailedBooking.user.firstName,
                    detailedBooking
                );
            }
        }

        await notify({
            userId: professionalId,
            userType: UserType.PROFESSIONAL,
            type: NotificationType.BOOKING_PAYMENT,
            data: result
        });

        logger.info(`e👌 Booking payment was completed for transaction:${transactionId}`);
    } catch (error) {
        service.handleTypeormError(error);
    }
});

payment.route(QueueEvents.PAYMENT_COMMITMENT_SUCCESSFUL, async (message: any, io: Server) => {
    const { payload: { bookingId, userId, professionalId } } = message;

    try {
        const chatService = new Chat();
        // Create the chat. If it already exists, it will throw an error we can catch.
        await chatService.createChat(userId, professionalId).catch(err => {
            logger.info(`Chat already exists or could not be created: ${err.message}`);
        });

        const bookingRepo = AppDataSource.getRepository(Booking);
        const booking = await bookingRepo.findOne({ where: { id: bookingId }, relations: ["user"] });

        await notify({
            userId: professionalId,
            userType: UserType.PROFESSIONAL,
            type: NotificationType.BOOKING_PAYMENT, // Use a specific type if available, otherwise this works
            data: { message: `A user has paid a commitment fee for a booking. You can now chat with ${booking?.user?.firstName}.`, bookingId }
        });

        logger.info(`💬 Chat unlocked and professional notified for booking:${bookingId}`);
    } catch (error: any) {
        logger.error(`Error handling commitment success: ${error.message}`);
        service.handleTypeormError(error);
    }
});


export default payment;