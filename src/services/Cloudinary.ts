import Service from "./Service";
import {imageFolders, CdnFolders, ResourceType} from "../types/constants";
import {UploadedFiles, FailedFiles, FileObject} from "../types";
import compressImage from "../utils/compressImage";
import cloudinary from "../config/cloudinary";
import logger from "../config/logger";
import fs from 'fs';
import path from 'path';
import deleteFiles from "../utils/deleteFiles";

export default class Cloudinary extends Service {

    public constructor() {
        super();
    }

    private getUrl(publicId: string) {
        return cloudinary.url(publicId, {
            transformation: [
                {fetch_format: 'auto'},
                {quality: 'auto'}
            ]
        });
    }

    private resolveResourceType(mime: string): ResourceType {
        if (mime.startsWith("image/")) return ResourceType.IMAGE;
        if (mime.startsWith("video/")) return ResourceType.VIDEO;
        if (mime.startsWith("audio/")) return ResourceType.VIDEO; // Cloudinary rule
        return ResourceType.RAW;
    }

    public async uploadV2(
        files: Express.Multer.File[] | FileObject[],
        resourceType: ResourceType,
        folder: CdnFolders
    ) {
        const uploadedFiles: UploadedFiles[] = [];
        const failedFiles: FailedFiles[] = [];
        const publicIds: string[] = [];

        const MAX_RETRIES = 3;
        const RETRY_DELAY = (attempt: number) => new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt)));

        await Promise.all(
            files.map(async (file: any) => {
                let attempt = 0;
                let success = false;

                while (attempt < MAX_RETRIES && !success) {
                    try {
                        const resolvedType = this.resolveResourceType(file.mimetype);

                        const baseDetails = {
                            resource_type: resolvedType,
                            folder: folder,
                            timeout: 100000,
                        };

                        // 📍 Handle both MemoryStorage (buffer) and DiskStorage (path)
                        const result: any = await new Promise((resolve, reject) => {
                            if (file.buffer) {
                                const stream = cloudinary.uploader.upload_stream(
                                    baseDetails,
                                    (error, result) => {
                                        if (error) reject(error);
                                        else resolve(result);
                                    }
                                );
                                stream.end(file.buffer);
                            } else if (file.path) {
                                cloudinary.uploader.upload(file.path, baseDetails)
                                    .then(resolve)
                                    .catch(reject);
                            } else {
                                reject(new Error("File object has neither buffer nor path."));
                            }
                        });


                        let thumbnail: null | string = null;
                        const url = resolvedType === ResourceType.IMAGE
                            ? this.getUrl(result.public_id)
                            : result.url;

                        const duration = resolvedType === ResourceType.VIDEO
                            ? result.duration
                            : null;

                        if (resolvedType === ResourceType.VIDEO) {
                            let thumbnailUrl = cloudinary.url(result.public_id, {
                                resource_type: 'video',
                                transformation: [
                                    { start_offset: "auto" },
                                    { width: 640, height: 360, crop: 'fill' },
                                    { quality: 'auto' },
                                    { format: 'jpg' },
                                ],
                            });

                            thumbnail = thumbnailUrl.split("?")[0] + ".jpg";
                        }

                        uploadedFiles.push({
                            publicId: result.public_id,
                            size: String(result.bytes),
                            url: url,
                            mimeType: file.mimetype,
                            thumbnail: thumbnail,
                            duration: duration
                        });

                        publicIds.push(result.public_id);
                        success = true;
                    } catch (error: any) {
                        attempt++;
                        if (attempt >= MAX_RETRIES) {
                            console.error(`Upload failed for ${file.originalname}:`, error);
                            failedFiles.push({ filename: file.originalname, error: error.message });
                        } else {
                            console.warn(`Retrying upload for ${file.originalname} (Attempt ${attempt})...`);
                            await RETRY_DELAY(attempt);
                        }
                    }
                }
            })
        );

        // 📍 Only attempt to delete files that were on disk
        const diskFiles = (files as any[]).filter(f => f.path);
        if (diskFiles.length > 0) {
            await deleteFiles(diskFiles);
        }
        
        return { uploadedFiles, failedFiles, publicIds };
    }

    public async upload(
        files: Express.Multer.File[],
        resourceType: ResourceType,
        folder: CdnFolders
    ) {
        const uploadedFiles: UploadedFiles[] = [];
        const failedFiles: FailedFiles[] = [];
        const publicIds: string[] = [];

        const MAX_RETRIES = 3;
        const RETRY_DELAY = (attempt: number) => new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt))); // Exponential backoff

        await Promise.all(
            files.map(async (file) => {
                let attempt = 0;
                let success = false;

                while (attempt < MAX_RETRIES && !success) {
                    try {
                        const buffer = resourceType === ResourceType.IMAGE
                            ? await compressImage(file)
                            : {error: false, buffer: file.buffer};

                        if (!buffer.error) {
                            const result: any = await new Promise((resolve, reject) => {
                                const baseDetails = {
                                    resource_type: resourceType,
                                    folder: folder,
                                    timeout: 100000,
                                };
                                const uploadStreamDetails = resourceType === ResourceType.VIDEO
                                    ? {
                                        ...baseDetails,
                                        eager: [
                                            {
                                                format: "jpg",
                                                transformation: [
                                                    {width: 300, height: 200, crop: "thumb", start_offset: "auto"}
                                                ]
                                            }
                                        ]
                                    }
                                    : baseDetails;

                                const stream = cloudinary.uploader.upload_stream(
                                    uploadStreamDetails,
                                    (error, result) => {
                                        if (error) reject(error);
                                        else resolve(result);
                                    }
                                );
                                stream.end(buffer.buffer);
                            });

                            const thumbnail = resourceType === ResourceType.VIDEO && result.eager
                                ? result.eager[0].secure_url
                                : null;

                            const url = resourceType === ResourceType.IMAGE
                                ? this.getUrl(result.public_id)
                                : result.url;

                            const duration = resourceType === ResourceType.VIDEO
                                ? result.duration
                                : null;

                            uploadedFiles.push({
                                publicId: result.public_id,
                                size: String(result.bytes),
                                url: url,
                                mimeType: file.mimetype,
                                thumbnail: thumbnail,
                                duration: duration
                            });

                            publicIds.push(result.public_id);
                            success = true;
                        } else {
                            failedFiles.push({filename: file.originalname, error: "Failed to compress image."});
                            break; // Don't retry if image compression fails
                        }
                    } catch (error: any) {
                        attempt++;
                        if (attempt >= MAX_RETRIES) {
                            console.error(`Upload failed for ${file.originalname}:`, error);
                            failedFiles.push({filename: file.originalname, error: error.message});
                        } else {
                            console.warn(`Retrying upload for ${file.originalname} (Attempt ${attempt})...`);
                            await RETRY_DELAY(attempt); // Wait before retrying
                        }
                    }
                }
            })
        );

        return {uploadedFiles, failedFiles, publicIds};
    }


    public async deleteFiles(publicIds: string[]) {
        try {
            const result = await cloudinary.api.delete_resources(publicIds);
            return this.responseData(200, false, "Files were deleted", result);
        } catch (error) {
            console.error(error);
            return this.responseData(500, true, "Something went wrong");
        }
    }

    public async uploadImage(filePath: string, imageFolder: string) {

        let uploadResult = null;
        let folder = imageFolders(imageFolder)!;

        try {
            uploadResult = await cloudinary.uploader.upload(filePath, {resource_type: "auto", folder: folder});
        } catch (error: any) {
            logger.error(`Error uploading file: ${error.message}`, {filePath, imageFolder});
            return super.responseData(500, true, "Something went wrong");
        }

        const url = this.getUrl(uploadResult.public_id);

        return super.responseData(201, false, null, {
            imageData: uploadResult,
            url
        });
    }

    public async updateImage(filePath: string, publicID: string) {
        try {
            const uploadResult = await cloudinary.uploader.upload(filePath, {
                public_id: publicID,
                overwrite: true // Ensures the image is replaced
            });
            const url = this.getUrl(uploadResult.public_id);

            return super.responseData(201, false, null, {
                imageData: uploadResult,
                url
            });
        } catch (error: any) {
            logger.error(`Error updating file: ${error.message}`, {filePath});
            return super.responseData(500, true, "Something went wrong");
        }
    }

    private fileOptions(type: string) {
        const resourceMap: Record<string, object> = {
            'image': {},
            'audio': {resource_type: "video"},
            'video': {resource_type: "video"},
        };
        return resourceMap[type] || {};
    }

    public async delete(publicID: string, type: string = "image") {
        const options = this.fileOptions(type);

        try {
            const response = await cloudinary.uploader.destroy(publicID, options);
            if (response.result == "ok") {
                return super.responseData(200, false, "File has been deleted")
            }
            return super.responseData(404, true, "File not found");
        } catch (error: any) {
            logger.error(`Error deleting file: ${error.message}`);
            return super.responseData(500, true, "Something went wrong");
        }
    }
}