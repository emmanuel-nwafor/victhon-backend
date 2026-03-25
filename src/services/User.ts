import {AppDataSource} from "../data-source";
import {CdnFolders, HttpStatus, ResourceType, UserType} from "../types/constants";
import Service from "./Service";
import {User as UserEntity} from "../entities/User";
import UserCache from "../cache/UserCache";
import UserSocket from "../cache/UserSocket";
import {EditUserDto} from "../types";
import emailValidator from "../validators/emailValidator";
import Cloudinary from "./Cloudinary";
import deleteFiles from "../utils/deleteFiles";
import UserChats from "../cache/UserChats";


export default class User extends Service {
    private readonly socketCache = new UserSocket();
    private readonly userCache: UserCache = new UserCache(UserType.USER);
    private readonly repo = AppDataSource.getRepository(UserEntity);
    public readonly userChats = new UserChats(UserType.USER);

    public async setSocketId(userId: string, socketId: string) {
        return await this.socketCache.set(UserType.USER, userId, socketId);
    }

    public async deleteSocketId(userId: string) {
        return await this.socketCache.delete(UserType.USER, userId);
    }

    public async getSocketId(userId: string) {
        return await this.socketCache.get(UserType.USER, userId);
    }


    public async profile(userId: string) {
        try {
            const userRepo = AppDataSource.getRepository(UserEntity);

            let user = await userRepo.findOneBy({id: userId});
            if (!user) return this.responseData(HttpStatus.NOT_FOUND, true, `User was not found.`);
            // const coords = (user.location as any).replace("POINT(", "").replace(")", "").split(" ");

            const data = {
                ...user,
                // longitude: parseFloat(coords[0]),
                // latitude: parseFloat(coords[1]),
                location: undefined,
                password: undefined
            };
            return this.responseData(HttpStatus.OK, false, `User was retrieved successfully.`, data);

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async uploadProfilePicture(userId: string, publicId: string, url: string) {
        try {
            const userRepo = AppDataSource.getRepository(UserEntity);

            let user = await userRepo.findOneBy({id: userId});
            if (!user) return this.responseData(HttpStatus.NOT_FOUND, true, `User was not found.`);

            if (user.profilePicture) return this.responseData(HttpStatus.BAD_REQUEST, true, `User already has a profile picture.`);

            user.profilePicture = {
                publicId,
                url
            };

            await userRepo.save(user);

            return this.responseData(HttpStatus.OK, false, `User was updated successfully.`, user);

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    async editUserProfile(
        userId: string,
        editData: EditUserDto
    ) {
        try {
            const user = await this.repo.findOne({
                where: {id: userId}
            });

            if (!user) return this.responseData(404, true, "User not found");

            /* ------------------ EMAIL VALIDATION ------------------ */
            if (editData.email && editData.email !== user.email) {
                if (!emailValidator(editData.email)) {
                    return this.responseData(400, true, "Invalid email");
                }

                const emailExists = await this.repo.findOne({
                    where: {email: editData.email}
                });

                if (emailExists) return this.responseData(400, true, "Email already exists");
            }

            /* ------------------ PHONE VALIDATION ------------------ */
            if (editData.phone && editData.phone !== user.phone) {
                const phoneExists = await this.repo.findOne({
                    where: {phone: editData.phone}
                });

                if (phoneExists) return this.responseData(400, true, "Phone number already exists");
            }

            let profilePicture = user.profilePicture;

            if (editData.file) {
                const cloudinary = new Cloudinary();

                const {uploadedFiles, failedFiles} =
                    await cloudinary.uploadV2(
                        [editData.file],
                        ResourceType.IMAGE,
                        CdnFolders.PROFILEPICTURE
                    );

                if (failedFiles?.length) {
                    return this.responseData(500, true, "Image upload failed", failedFiles);
                }

                profilePicture = {
                    url: uploadedFiles[0]!.url,
                    publicId: uploadedFiles[0]!.publicId
                };

                if (user.profilePicture?.publicId) {
                    await cloudinary.delete(user.profilePicture.publicId);
                }
            }



            const updatedData = {
                firstName: editData.firstName?.trim() ?? user.firstName,
                lastName: editData.lastName?.trim() ?? user.lastName,
                email: editData.email ?? user.email,
                phone: editData.phone ?? user.phone,
                isActive: editData.isActive ?? user.isActive,
                profilePicture: profilePicture!,
            };

            await this.repo.update(userId, updatedData);

            const updatedProfessional =
                await this.repo.findOne({
                    where: {id: userId}
                });

            return this.responseData(
                200,
                false,
                "Profile updated successfully",
                updatedProfessional
            );

        } catch (error) {
            if (editData.file) {
                await deleteFiles(editData.file);
            }
            return this.handleTypeormError(error);
        }
    }

    public async savePushToken(userId: string, pushToken: string) {
        try {
            await this.repo.update(userId, { pushToken });
            return this.responseData(200, false, "Push token saved successfully");
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
}