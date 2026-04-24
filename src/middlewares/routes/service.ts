import {body, param, query} from 'express-validator';
import {handleValidationErrors} from "../validators";
import {ResourceType, UserType} from "../../types/constants";
import uploads from '../multer';
import verifyJWT from '../verifyJWT';

export const updateServiceImagesValidator = [
    verifyJWT([UserType.PROFESSIONAL]),
    uploads(ResourceType.IMAGE).array('images', 6),
    handleValidationErrors
];

export const add = [
    verifyJWT([UserType.PROFESSIONAL]),
    uploads(ResourceType.IMAGE).array('images', 6),
    body("name")
        .isString()
        .isLength({min: 1, max: 50})
        .withMessage("Name must be a string and max 50 characters"),

    body("category")
        .isString()
        .isLength({min: 1, max: 80})
        .withMessage("Category must be a string and max 80 characters"),

    body("description")
        .isString()
        .isLength({min: 1, max: 80})
        .withMessage("Description must be a string and max 80 characters"),

    body("price")
        .isNumeric()
        .toFloat()
        .withMessage("Price must be a valid decimal")
        .toFloat(),

    body("hourlyPrice")
        .optional()
        .isNumeric()
        .toFloat()
        .withMessage("Hourly price must be a valid decimal"),

    body("address")
        .optional()
        .isString()
        .isLength({max: 100})
        .withMessage("Address must be a string and max 100 characters"),

    body("remoteLocationService")
        .isBoolean()
        .withMessage("remoteLocationService must be boolean")
        .toBoolean(),


    body("onsiteLocationService")
        .isBoolean()
        .withMessage("onsiteLocationService must be boolean")
        .toBoolean(),

    body("storeLocationService")
        .isBoolean()
        .withMessage("storeLocationService must be boolean")
        .toBoolean(),
    handleValidationErrors
];

export const validateServiceSearch = [
    verifyJWT([UserType.USER]),
    query("name")
        .optional()
        .isString()
        .withMessage("name must be a string"),

    // Category filter: optional string
    query("category")
        .optional()
        .isString()
        .withMessage("category must be a string"),

    // Description filter: optional string
    query("description")
        .optional()
        .isString()
        .withMessage("description must be a string"),

    // minPrice: optional decimal >= 0
    query("minPrice")
        .optional()
        .isFloat({min: 0})
        .withMessage("minPrice must be a positive number")
        .toFloat(),

    // maxPrice: optional decimal >= 0
    query("maxPrice")
        .optional()
        .isFloat({min: 0})
        .withMessage("maxPrice must be a positive number")
        .toFloat(),

    // remote: optional boolean
    query("remote")
        .optional()
        .isBoolean()
        .withMessage("remote must be true or false")
        .toBoolean(),

    // onsite: optional boolean
    query("onsite")
        .optional()
        .isBoolean()
        .withMessage("onsite must be true or false")
        .toBoolean(),

    // store: optional boolean
    query("store")
        .optional()
        .isBoolean()
        .withMessage("store must be true or false")
        .toBoolean(),

    // professionalId: optional UUID string
    query("professionalId")
        .optional()
        .isUUID()
        .withMessage("professionalId must be a valid UUID"),

    // limit: optional integer >= 1, default 10
    query("limit")
        .optional()
        .isInt({min: 1})
        .withMessage("limit must be an integer greater than 0")
        .toInt(),

    // page: optional integer >= 1, default 1
    query("page")
        .optional()
        .isInt({min: 1})
        .withMessage("page must be an integer greater than 0")
        .toInt(),
    handleValidationErrors,
];


export const packageValidator = [
    verifyJWT([UserType.PROFESSIONAL, UserType.USER]),

    param("professionalId")
        .isUUID()
        .withMessage("Invalid professional Id (must be a UUID)"),

    param("id")
        .isUUID()
        .withMessage("Invalid package Id (must be a UUID)"),

    handleValidationErrors
];

export const allServices = [
    verifyJWT([UserType.USER]),
];

export const packagesValidator = [
    verifyJWT([UserType.PROFESSIONAL, UserType.USER]),
    param("professionalId")
        .isUUID()
        .withMessage("Invalid professional Id (must be a UUID)"),
    handleValidationErrors
];

export const deleteValidator = [
    verifyJWT([UserType.PROFESSIONAL]),
    param("id")
        .isUUID()
        .withMessage("Invalid package id (must be a UUID)"),
    handleValidationErrors
];

export const updateServiceValidator = [
    verifyJWT([UserType.PROFESSIONAL]),

    // identifiers
    param("id")
        .isUUID()
        .withMessage("Service id must be a valid UUID"),

    // fields being updated (all optional)
    body("name")
        .optional()
        .isString()
        .isLength({min: 2, max: 100})
        .withMessage("Name must be between 2 and 100 characters"),

    body("description")
        .optional()
        .isString()
        .isLength({min: 5, max: 1000})
        .withMessage("Description must be between 5 and 1000 characters"),

    body("category")
        .optional()
        .isString()
        .withMessage("Category must be a string"),

    body("price")
        .optional()
        .isFloat({min: 0})
        .withMessage("Price must be a positive number"),

    body("hourlyPrice")
        .optional()
        .isFloat({min: 0})
        .withMessage("Hourly price must be a positive number"),

    body("address")
        .optional()
        .isString()
        .isLength({min: 3, max: 255})
        .withMessage("Address must be valid"),

    body("remoteLocationService")
        .optional()
        .isBoolean()
        .withMessage("remoteLocationService must be boolean"),

    body("onsiteLocationService")
        .optional()
        .isBoolean()
        .withMessage("onsiteLocationService must be boolean"),

    body("storeLocationService")
        .optional()
        .isBoolean()
        .withMessage("storeLocationService must be boolean"),

    body("isActive")
        .optional()
        .isBoolean()
        .withMessage("isActive must be boolean"),
    handleValidationErrors
];