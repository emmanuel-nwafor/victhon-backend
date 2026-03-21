import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../validators";
import verifyJWT from "../verifyJWT";
import { UserType } from "../../types/constants";

export const createBooking = [
    verifyJWT([UserType.USER]),
    // professionalId UUID
    body("professionalId")
        .notEmpty().withMessage("professionalId is required")
        .isUUID().withMessage("professionalId must be a valid UUID"),

    // packageId UUID
    body("serviceIds")
        .isArray({ min: 1 })
        .withMessage("serviceId must be a non-empty array"),

    body('address')
        .optional()
        .isString().withMessage('Address must be a string')
        .isLength({ min: 3 }).withMessage('Address must be at least 3 characters'),

    body("serviceIds.*")
        .isUUID()
        .withMessage("Each serviceId ID must be a valid UUID"),
    // body("packageId")
    //     .notEmpty().withMessage("packageId is required")
    //     .isUUID().withMessage("packageId must be a valid UUID"),

    // startDateTime
    body("startDateTime")
        .notEmpty().withMessage("startDateTime is required")
        .custom(value => {
            const date = new Date(value);
            if (isNaN(date.getTime())) throw new Error("startDateTime must be a valid date");
            return true;
        }),

    // endDateTime
    body("endDateTime")
        .notEmpty().withMessage("endDateTime is required")
        .custom(value => {
            const date = new Date(value);
            if (isNaN(date.getTime())) throw new Error("endDateTime must be a valid date");
            return true;
        }),

    // Ensure endDateTime > startDateTime
    body("endDateTime").custom((value, { req }) => {
        const start = new Date(req.body.startDateTime);
        const end = new Date(value);
        if (end <= start) {
            throw new Error("endDateTime must be after startDateTime");
        }
        return true;
    }),
    handleValidationErrors
];


export const acceptBooking = [
    verifyJWT([UserType.PROFESSIONAL]),
    param("bookingId")
        .notEmpty().withMessage("bookingId is required")
        .isUUID().withMessage("bookingId must be a valid UUID"),
    handleValidationErrors
];

export const rejectBooking = [...acceptBooking];
export const reviewBooking = [...acceptBooking]

export const completeBooking = [
    verifyJWT([UserType.USER]),
    param("bookingId")
        .notEmpty().withMessage("bookingId is required")
        .isUUID().withMessage("bookingId must be a valid UUID"),
    handleValidationErrors
];

export const cancelBooking = [...completeBooking];

export const getProBooking = [
    verifyJWT([UserType.PROFESSIONAL]),
    param("bookingId")
        .notEmpty().withMessage("bookingId is required")
        .isUUID().withMessage("bookingId must be a valid UUID"),
    handleValidationErrors
];

export const getUserBooking = [
    verifyJWT([UserType.USER]),
    param("bookingId")
        .notEmpty().withMessage("bookingId is required")
        .isUUID().withMessage("bookingId must be a valid UUID"),
    handleValidationErrors
];

export const proBookings = [
    verifyJWT([UserType.PROFESSIONAL]),
    query('page').optional().isInt({ min: 1 }).withMessage("page must be an integer"),
    query('limit').optional().isInt({ min: 1 }).withMessage("limit must be an integer"),
    handleValidationErrors
];

export const userBookings = [
    verifyJWT([UserType.USER]),
    query('page').optional().isInt({ min: 1 }).withMessage("page must be an integer"),
    query('limit').optional().isInt({ min: 1 }).withMessage("limit must be an integer"),
    handleValidationErrors
];

export const bookings = [
    verifyJWT([UserType.USER]),
    param("professionalId")
        .notEmpty().withMessage("professionalId is required")
        .isUUID().withMessage("professionalId must be a valid UUID"),
    query('page').optional().isInt({ min: 1 }).withMessage("page must be an integer"),
    query('limit').optional().isInt({ min: 1 }).withMessage("limit must be an integer"),
    handleValidationErrors
];

export const disputeBooking = [
    ...completeBooking,
    body("reason").optional().isString().withMessage("Reason must be a valid string"),
    handleValidationErrors
];