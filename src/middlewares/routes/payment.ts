import {body, param} from "express-validator";
import {handleValidationErrors} from "../validators";
import {UserType} from "../../types/constants";
import verifyJWT from "../verifyJWT";

export const initializeValidator = [
    verifyJWT([UserType.USER]),
    param('bookingId')
        .exists().withMessage('Booking ID is required')
        .isUUID().withMessage('Booking ID must be a valid id'),
    handleValidationErrors
];

export const withdrawValidator = [
    verifyJWT([UserType.PROFESSIONAL]),
    body('accountId')
        .optional()
        .isUUID().withMessage('Account ID must be a valid id'),
    body('amount')
        .exists().withMessage('Amount is required')
        .isNumeric().withMessage('Amount must be a positive numeric value'),
    handleValidationErrors
];