import {Server, Socket} from "socket.io";
import {Job} from "bullmq";
import {JobType, QueueType} from "./constants";

export interface Cache { // TODO: use this only for users
    get: (key: string) => Promise<{ error: boolean; data?: any }>;
    set: (email: string, data: any) => Promise<boolean>;
}

export class EditUserDto {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    isActive?: boolean;
    file?: Express.Multer.File | undefined;
}


export class EditProfessionalDto {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    country?: string;
    state?: string;
    bio?: string;
    skills?: string[];
    baseCity?: string;
    currentAddress?: string;
    availability?: boolean;
    isActive?: boolean;
    longitude?: number;
    latitude?: number;
    file?: Express.Multer.File | undefined; // profile picture
    businessLogo?: Express.Multer.File | undefined;
};

export class SetupBusinessProfileDto {
    businessName: string;
    businessCategory: string;
    businessType: string;
    ninNumber: string;
    logo?: Express.Multer.File | undefined;    // business logo image
    ninSlip?: Express.Multer.File | undefined; // NIN slip / ID card image
};

export interface UploadedImageData {
    mimeType: string;
    imageUrl: string;
    publicId: string;
    size: number;
}

export interface UploadResult {
    success: boolean;
    data?: Record<string, UploadedImageData>;
    error?: { fieldName: string; message: string }[];
    publicIds?: string[]
}

export interface UploadArrResult {
    success: boolean;
    data?: UploadedImageData[];
    error?: { fieldName: string; message: string }[];
    publicIds?: string[]
}


export type UploadedFiles = {
    publicId: string,
    size: string,
    url: string,
    mimeType: string,
    thumbnail: string | null,
    duration: string | null
};

export type FailedFiles = {
    filename: string,
    error: string
};


export type EventHandler<T> = (message: T, io: Server) => Promise<void> | void;

export const exchange = 'victhon_exchange';

export interface QueueConfig {
    name: string;
    durable: boolean;
    routingKeyPattern: string;
    exchange: string; // Dynamic exchange name for the queue
    handlers: Record<string, EventHandler<any>>;
}

import { WorkerOptions } from "bullmq";

export interface WorkerConfig extends Omit<WorkerOptions, "connection"> {
    connection: { url: string; [key: string]: any };
}

export interface IWorker<T> {
    process: (job: Job<T>) => Promise<void>,
    completed?: (job: Job<any, void, string>, result: void, prev: string) => void,
    failed?: (job: Job<any, void, string> | undefined, error: Error, prev: string) => void,
    drained?: () => void,
    config: WorkerConfig,
    queueName: JobType
}

export interface ISocket extends Socket {
    locals?: any
}

export interface FileObject {
    mimetype: string;
    filename: string;
    path: string;
    size: number;
    originalname: string;
}