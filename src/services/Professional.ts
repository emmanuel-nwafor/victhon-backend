import { AppDataSource } from "../data-source";
import { CdnFolders, HttpStatus, ResourceType, UserType } from "../types/constants";
import Service from "./Service";
import { Professional as ProfessionalEntity } from "../entities/Professional";
import { EditProfessionalDto, SetupBusinessProfileDto } from "../types";
import emailValidator from "../validators/emailValidator";
import Cloudinary from "./Cloudinary";
import deleteFiles from "../utils/deleteFiles";
import UserSocket from "../cache/UserSocket";
import UserCache from "../cache/UserCache";
import UserChats from "../cache/UserChats";

export default class Professional extends Service {
    public async savePushToken(userId: string, pushToken: string) {
        console.log("📥 [Professional] Saving Push Token:", pushToken);
        try {
            const professional = await this.repo.findOne({ where: { id: userId } });
            if (!professional) return this.responseData(HttpStatus.NOT_FOUND, true, "Professional not found");

            await this.repo.update(userId, { pushToken });

            return this.responseData(HttpStatus.OK, false, "Push token saved successfully");
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    private readonly socketCache = new UserSocket();
    private readonly userCache: UserCache = new UserCache(UserType.PROFESSIONAL);
    public readonly userChats = new UserChats(UserType.PROFESSIONAL);


    public async setSocketId(userId: string, socketId: string) {
        return await this.socketCache.set(UserType.PROFESSIONAL, userId, socketId);
    }

    public async deleteSocketId(userId: string) {
        return await this.socketCache.delete(UserType.PROFESSIONAL, userId);
    }

    public async getSocketId(userId: string) {
        return await this.socketCache.get(UserType.PROFESSIONAL, userId);
    }

    private readonly repo = AppDataSource.getRepository(ProfessionalEntity);

    public async profile(userId: string) {
        try {
            const userRepo = AppDataSource.getRepository(ProfessionalEntity);

            let user = await userRepo.findOne({ where: { id: userId } });
            if (!user) return this.responseData(HttpStatus.NOT_FOUND, true, `Professional was not found.`);
            const coords = (user.location as any).replace("POINT(", "").replace(")", "").split(" ");


            const data = {
                ...user,
                longitude: parseFloat(coords[0]),
                latitude: parseFloat(coords[1]),
                location: undefined,
                password: undefined
            };
            return this.responseData(HttpStatus.OK, false, `User was retrieved successfully.`, data);

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    async setupBusinessProfile(
        professionalId: string,
        dto: SetupBusinessProfileDto
    ) {
        const cloudinary = new Cloudinary();
        const uploadedPublicIds: string[] = [];

        try {
            const professional = await this.repo.findOne({ where: { id: professionalId } });
            if (!professional) return this.responseData(404, true, "Professional not found");

            /* --- Upload business logo --- */
            let businessLogo = professional.businessLogo ?? null;
            if (dto.logo) {
                const { uploadedFiles, failedFiles } = await cloudinary.uploadV2(
                    [dto.logo],
                    ResourceType.IMAGE,
                    CdnFolders.PROFILEPICTURE
                );

                if (failedFiles?.length) {
                    return this.responseData(500, true, "Logo upload failed", failedFiles);
                }

                // Delete the old logo from Cloudinary if it exists
                if (professional.businessLogo?.publicId) {
                    await cloudinary.delete(professional.businessLogo.publicId);
                }

                businessLogo = {
                    url: uploadedFiles[0]!.url,
                    publicId: uploadedFiles[0]!.publicId,
                };
                uploadedPublicIds.push(uploadedFiles[0]!.publicId);
            }

            /* --- Upload NIN slip --- */
            let ninSlipUrl = professional.ninSlipUrl ?? null;
            if (dto.ninSlip) {
                const { uploadedFiles, failedFiles } = await cloudinary.uploadV2(
                    [dto.ninSlip],
                    ResourceType.IMAGE,
                    CdnFolders.PROFILEPICTURE   // reuse existing folder; adjust if you add a dedicated one
                );

                if (failedFiles?.length) {
                    return this.responseData(500, true, "NIN slip upload failed", failedFiles);
                }

                ninSlipUrl = uploadedFiles[0]!.url;
                uploadedPublicIds.push(uploadedFiles[0]!.publicId);
            }

            await this.repo.update(professionalId, {
                businessName: dto.businessName,
                businessCategory: dto.businessCategory,
                businessType: dto.businessType,
                ninNumber: dto.ninNumber,
                ninSlipUrl: ninSlipUrl ?? undefined,
                businessLogo: businessLogo!,
            });

            const updated = await this.repo.findOne({ where: { id: professionalId } });

            return this.responseData(200, false, "Business profile set up successfully", updated);

        } catch (error) {
            // Clean up any already-uploaded files on failure
            for (const publicId of uploadedPublicIds) {
                await (new Cloudinary()).delete(publicId).catch(() => { });
            }
            if (dto.logo) await deleteFiles(dto.logo).catch(() => { });
            if (dto.ninSlip) await deleteFiles(dto.ninSlip).catch(() => { });
            return this.handleTypeormError(error);
        }
    }

    async editProfessionalProfile(
        professionalId: string,
        editData: EditProfessionalDto
    ) {
        try {
            const professional = await this.repo.findOne({
                where: { id: professionalId }
            });

            if (!professional) return this.responseData(404, true, "Professional not found");

            /* ------------------ EMAIL VALIDATION ------------------ */
            if (editData.email && editData.email !== professional.email) {
                if (!emailValidator(editData.email)) {
                    return this.responseData(400, true, "Invalid email");
                }

                const emailExists = await this.repo.findOne({
                    where: { email: editData.email }
                });

                if (emailExists) return this.responseData(400, true, "Email already exists");
            }

            /* ------------------ PHONE VALIDATION ------------------ */
            if (editData.phone && editData.phone !== professional.phone) {
                const phoneExists = await this.repo.findOne({
                    where: { phone: editData.phone }
                });

                if (phoneExists) return this.responseData(400, true, "Phone number already exists");
            }

            let profilePicture = professional.profilePicture;
            let businessLogo = professional.businessLogo;

            if (editData.file) {
                const cloudinary = new Cloudinary();

                const { uploadedFiles, failedFiles } =
                    await cloudinary.uploadV2(
                        [editData.file],
                        ResourceType.IMAGE,
                        CdnFolders.PROFILEPICTURE
                    );

                if (failedFiles?.length) {
                    return this.responseData(500, true, "Profile image upload failed", failedFiles);
                }

                if (professional.profilePicture?.publicId) {
                    await cloudinary.delete(professional.profilePicture.publicId);
                }

                profilePicture = {
                    url: uploadedFiles[0]!.url,
                    publicId: uploadedFiles[0]!.publicId
                };
            }

            if (editData.businessLogo) {
                const cloudinary = new Cloudinary();

                const { uploadedFiles, failedFiles } =
                    await cloudinary.uploadV2(
                        [editData.businessLogo],
                        ResourceType.IMAGE,
                        CdnFolders.PROFILEPICTURE
                    );

                if (failedFiles?.length) {
                    return this.responseData(500, true, "Business logo upload failed", failedFiles);
                }

                if (professional.businessLogo?.publicId) {
                    await cloudinary.delete(professional.businessLogo.publicId);
                }

                businessLogo = {
                    url: uploadedFiles[0]!.url,
                    publicId: uploadedFiles[0]!.publicId
                };
            }

            let location = professional.location;

            if (editData.longitude && editData.latitude) location = `POINT(${editData.longitude} ${editData.latitude})` as any;

            // Restrict name changes
            if (editData.firstName && professional.firstName && editData.firstName.trim() !== professional.firstName) {
                return this.responseData(400, true, "First name change is restricted. Please contact support.");
            }
            if (editData.lastName && professional.lastName && editData.lastName.trim() !== professional.lastName) {
                return this.responseData(400, true, "Last name change is restricted. Please contact support.");
            }

            const updatedData: any = {
                email: editData.email ?? professional.email,
                phone: editData.phone ?? professional.phone,
                country: editData.country ?? professional.country,
                state: editData.state ?? professional.state,
                bio: editData.bio?.trim() ?? professional.bio,
                skills: Array.isArray(editData.skills)
                    ? editData.skills.slice(0, 20)
                    : professional.skills,
                baseCity: editData.baseCity ?? professional.baseCity,
                currentAddress: editData.currentAddress ?? professional.currentAddress,
                availability: editData.availability ?? professional.availability,
                isActive: editData.isActive ?? professional.isActive,
                profilePicture: profilePicture!,
                businessLogo: businessLogo!,
                location
            };

            if (!professional.firstName && editData.firstName) {
                updatedData.firstName = editData.firstName.trim();
            }
            if (!professional.lastName && editData.lastName) {
                updatedData.lastName = editData.lastName.trim();
            }

            await this.repo.update(professionalId, updatedData);

            const updatedProfessional =
                await this.repo.findOne({
                    where: { id: professionalId }
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

    async updateAvailability(
        professionalId: string,
        availability: boolean
    ) {
        try {
            const professional = await this.repo.findOne({
                where: { id: professionalId }
            });

            if (!professional) return this.responseData(404, true, "Professional not found");

            await this.repo.update(professionalId, { availability });

            return this.responseData(
                200,
                false,
                "Availability was updated successfully",
            );

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }


    // public async views(professionalId: string, page: number, limit: number) {
    //     try {
    //         const skip = (page - 1) * limit;
    //         const viewRepo = AppDataSource.getRepository(ProfileView);

    //         const [records, total] = await viewRepo.findAndCount({
    //             where: { professionalId: professionalId },
    //             relations: ['user'],
    //             skip,
    //             take: limit,
    //             order: { updatedAt: "DESC" },
    //         });

    //         const data = {
    //             records: records,
    //             pagination: this.pagination(page, limit, total),
    //         }

    //         return this.responseData(200, false, "Views have been retrieved successfully", data)
    //     } catch (error) {
    //         return this.handleTypeormError(error);
    //     }
    // }

    public async uploadProfilePicture(userId: string, publicId: string, url: string) {
        try {

            let user = await this.repo.findOneBy({ id: userId });
            if (!user) return this.responseData(HttpStatus.NOT_FOUND, true, `User was not found.`);

            if (user.profilePicture) return this.responseData(HttpStatus.BAD_REQUEST, true, `User already has a profile picture.`);

            user.profilePicture = {
                publicId,
                url
            };

            await this.repo.save(user);

            return this.responseData(HttpStatus.OK, false, `User was updated successfully.`, user);

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
}