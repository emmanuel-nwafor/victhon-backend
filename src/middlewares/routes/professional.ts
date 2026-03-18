import { body } from "express-validator";
import { handleValidationErrors } from "../validators";
import uploads from "../multer";
import { ResourceType } from "../../types/constants";

export const editProfessionalValidator = [
    uploads(ResourceType.IMAGE).single('image'),
    body("email")
        .optional()
        .isEmail()
        .withMessage("Invalid email address")
        .isLength({ max: 50 })
        .withMessage("Email must not exceed 50 characters"),

    body("phone")
        .optional()
        .isString()
        .isLength({ min: 7, max: 20 })
        .withMessage("Phone number must be between 7 and 20 characters"),

    body("firstName")
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage("First name must be between 1 and 50 characters"),

    body("lastName")
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage("Last name must be between 1 and 50 characters"),

    body("country")
        .optional()
        .isString()
        .isLength({ max: 50 })
        .withMessage("Country must not exceed 50 characters"),

    body("state")
        .optional()
        .isString()
        .isLength({ max: 80 })
        .withMessage("State must not exceed 80 characters"),

    body("bio")
        .optional()
        .isString()
        .trim()
        .isLength({ max: 1000 })
        .withMessage("Bio must not exceed 1000 characters"),

    body("skills")
        .optional()
        .isArray({ max: 20 })
        .withMessage("Skills must be an array with max 20 items"),

    body("skills.*")
        .optional()
        .isString()
        .isLength({ max: 50 })
        .withMessage("Each skill must not exceed 50 characters"),

    body("baseCity")
        .optional()
        .isString()
        .isLength({ max: 100 })
        .withMessage("Base city must not exceed 100 characters"),

    body("currentAddress")
        .optional()
        .isString()
        .isLength({ max: 255 })
        .withMessage("Current address must not exceed 255 characters"),

    body("availability")
        .optional()
        .isBoolean()
        .withMessage("Availability must be a boolean"),

    body("isActive")
        .optional()
        .isBoolean()
        .withMessage("isActive must be a boolean"),

    // 📍 Longitude & Latitude must come together
    body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),

    body()
        .custom((_, { req }) => {
            const hasLat = req.body.latitude !== undefined;
            const hasLng = req.body.longitude !== undefined;

            if (hasLat !== hasLng) {
                throw new Error("Latitude and longitude must be provided together");
            }
            return true;
        }),
    handleValidationErrors
];


export const validatePhotoField = [

    body("url")
        // .exists().withMessage("url is required")
        .isString().withMessage("url must be a string")
        .isURL().withMessage("url must be a valid URL"),

    body("publicId")
        // .exists().withMessage("publicId is required")
        .isString().withMessage("publicId must be a string"),
    handleValidationErrors
];

export const setupBusinessProfileValidator = [
    // Accept two image fields: logo and ninSlip
    uploads(ResourceType.IMAGE).fields([
        { name: 'logo', maxCount: 1 },
        { name: 'ninSlip', maxCount: 1 },
    ]),

    body("businessName")
        .notEmpty().withMessage("Business name is required")
        .isString()
        .isLength({ max: 100 }).withMessage("Business name must not exceed 100 characters"),

    body("businessCategory")
        .notEmpty().withMessage("Business category is required")
        .isString()
        .isLength({ max: 100 }).withMessage("Business category must not exceed 100 characters"),

    body("businessType")
        .notEmpty().withMessage("Registration type is required")
        .isString()
        .isLength({ max: 100 }).withMessage("Registration type must not exceed 100 characters"),

    body("ninNumber")
        .notEmpty().withMessage("NIN number is required")
        .isString()
        .isLength({ min: 11, max: 11 }).withMessage("NIN must be exactly 11 digits")
        .matches(/^\d{11}$/).withMessage("NIN must contain only digits"),

    handleValidationErrors
];