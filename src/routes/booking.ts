import {Router, Request, Response} from 'express';
import asyncHandler from "express-async-handler";
import Controller from "../controllers/Booking";
import {
    acceptBooking,
    bookings,
    cancelBooking,
    completeBooking,
    createBooking,
    getProBooking,
    getUserBooking,
    proBookings,
    rejectBooking,
    reviewBooking,
    userBookings
} from '../middlewares/routes/booking';

const booking = Router();

booking.get("/professionals/:bookingId", getProBooking, asyncHandler(Controller.getProBooking));
booking.get("/users/:bookingId", getUserBooking, asyncHandler(Controller.getUserBooking));
booking.get("/professionals", proBookings, asyncHandler(Controller.getProBookings));
booking.get("/users", userBookings, asyncHandler(Controller.getUserBookings));

booking.get("/schedules/:professionalId", bookings, asyncHandler(Controller.bookings));


booking.post("/", createBooking, asyncHandler(Controller.book));
booking.patch("/accept/:bookingId", acceptBooking, asyncHandler(Controller.acceptBooking));
booking.patch("/start-moving/:bookingId", acceptBooking, asyncHandler(Controller.startMoving));
booking.patch("/reject/:bookingId", rejectBooking, asyncHandler(Controller.rejectBooking));
booking.patch("/complete/:bookingId", completeBooking, asyncHandler(Controller.completeBooking));
booking.patch("/review/:bookingId", reviewBooking, asyncHandler(Controller.reviewBooking));
booking.patch("/cancel/:bookingId", cancelBooking, asyncHandler(Controller.cancelBooking));


// booking.post("/schedule", asyncHandler(Controller.createSchedule));


export default booking;