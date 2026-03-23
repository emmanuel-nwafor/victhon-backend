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
    body('pin')
        .exists().withMessage('PIN is required')
        .isString().withMessage('PIN must be a string')
        .isLength({ min: 4 }).withMessage('PIN must be at least 4 characters'),
    handleValidationErrors
];

export const setupPinValidator = [
    verifyJWT([UserType.PROFESSIONAL]),
    body('pin')
        .exists().withMessage('PIN is required')
        .isString().withMessage('PIN must be a string')
        .isLength({ min: 4 }).withMessage('PIN must be at least 4 characters'),
    handleValidationErrors
];

export const resolveAccountValidator = [
    verifyJWT([UserType.PROFESSIONAL, UserType.USER]),
    body('accountNumber')
        .exists().withMessage('Account number is required')
        .isString(),
    body('bankCode')
        .exists().withMessage('Bank code is required')
        .isString(),
    handleValidationErrors
];