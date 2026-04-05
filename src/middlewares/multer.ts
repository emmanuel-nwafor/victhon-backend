
import multer, { FileFilterCallback } from "multer";
import { Request, Express } from "express";
import { ResourceType } from "../types/constants";
import fs from 'fs';
import path from 'path';

const allowedMimeTypes: string[] = ['image/jpeg', 'image/jpg', 'image/png'];
const fileSize: number = 10.0 * 1024 * 1024; // Increased to 10MB to accommodate high-res mobile photos

const typeError = "LIMIT_INVALID_FILE_TYPE";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, name);
    },
});

const imageFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error(typeError));
    }
    return cb(null, true);
};

const pdfFilter = (req: any, file: Express.Multer.File, cb: any) => {
    if (file.mimetype === "application/pdf") {
        return cb(null, true);
    } else {
        return cb(new Error(typeError), false);
    }
};

const videoFilter = (req: any, file: Express.Multer.File, cb: any) => {
    if (file.mimetype.startsWith("video/")) {
        return cb(null, true);
    } else {
        return cb(new Error(typeError), false);
    }
};

const audioFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimeTypes = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/aac"];
    if (allowedMimeTypes.includes(file.mimetype)) {
        return cb(null, true); // Accept file
    } else {
        return cb(new Error(typeError)); // Reject file
    }
};

const uploads = (resourceType: ResourceType, maxFiles: number = 100) => {
    let fileFilter = imageFilter;
    const fileSize = resourceType === ResourceType.IMAGE ? 10.0 * 1024 * 1024 : 50 * 1024 * 1024; // 10MB for images
    if (resourceType == ResourceType.PDF) fileFilter = pdfFilter;
    if (resourceType === ResourceType.VIDEO) fileFilter = videoFilter;
    // if (resourceType === ResourceType.AUDIO) fileFilter = audioFilter;

    return multer({
        storage: storage,
        limits: { fileSize: fileSize, files: maxFiles },
        fileFilter: fileFilter
    });
}

export const mediaUpload = (maxFiles: number = 6) => {

    return multer({
        storage: storage,
        limits: { fileSize: 100 * 1024 * 1024, files: maxFiles },
        fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'video/mp4', 'video/webm','video/mpeg',"application/pdf"];
            if (!allowedMimeTypes.includes(file.mimetype)) {
                return cb(new Error(typeError));
            }
            return cb(null, true);
        }
    });
}

export default uploads;
