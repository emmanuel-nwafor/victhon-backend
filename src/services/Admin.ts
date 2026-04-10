import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Professional } from "../entities/Professional";
import { Transaction } from "../entities/Transaction";
import { Booking } from "../entities/Booking";
import { Admin } from "../entities/Admin";
import { Escrow, EscrowStatus, RefundStatus } from "../entities/Escrow";
import { PlatformSetting } from "../entities/PlatformSetting";
import { Dispute, DisputeStatus } from "../entities/Dispute";
import Service from "./Service";
import { HttpStatus } from "../types/constants";
import Password from "../utils/Password";
import env, { EnvKey } from "../config/env";

export default class AdminService extends Service {
    private storedSalt: string = env(EnvKey.STORED_SALT)!;

    public async getUsers(page: number = 1, limit: number = 20) {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const [users, total] = await userRepo.findAndCount({
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "DESC" },
            });

            return this.responseData(HttpStatus.OK, false, "Users fetched successfully", {
                users,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async toggleUserStatus(id: string, isActive: boolean) {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOneBy({ id });

            if (!user) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "User not found");
            }

            user.isActive = isActive;
            await userRepo.save(user);

            return this.responseData(HttpStatus.OK, false, `User ${isActive ? 'activated' : 'suspended'} successfully`, user);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getProfessionals(page: number = 1, limit: number = 20) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const [professionals, total] = await proRepo.findAndCount({
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "DESC" },
            });

            return this.responseData(HttpStatus.OK, false, "Professionals fetched successfully", {
                professionals,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async toggleProfessionalStatus(id: string, isActive: boolean) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const professional = await proRepo.findOneBy({ id });

            if (!professional) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Professional not found");
            }

            professional.isActive = isActive;
            await proRepo.save(professional);

            return this.responseData(HttpStatus.OK, false, `Professional ${isActive ? 'activated' : 'suspended'} successfully`, professional);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getPendingProfessionals(page: number = 1, limit: number = 20) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const [professionals, total] = await proRepo.findAndCount({
                where: { isVerified: false }, // You might add a check for ninSlipUrl NOT NULL if needed
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "ASC" },
            });

            return this.responseData(HttpStatus.OK, false, "Pending professionals fetched successfully", {
                professionals,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async verifyProfessional(id: string, isVerified: boolean) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const professional = await proRepo.findOneBy({ id });

            if (!professional) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Professional not found");
            }

            professional.isVerified = isVerified;
            await proRepo.save(professional);

            return this.responseData(HttpStatus.OK, false, `Professional ${isVerified ? 'verified' : 'unverified'} successfully`, professional);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getStats() {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const proRepo = AppDataSource.getRepository(Professional);
            const transRepo = AppDataSource.getRepository(Transaction);
            const bookingRepo = AppDataSource.getRepository(Booking);
            const escrowRepo = AppDataSource.getRepository(Escrow);

            const totalUsers = await userRepo.count();
            const totalProfessionals = await proRepo.count();
            const totalTransactions = await transRepo.count();
            const totalBookings = await bookingRepo.count();
            
            const pendingVerifications = await proRepo.countBy({ isVerified: false });
            
            const activeEscrowResult = await escrowRepo
                .createQueryBuilder("escrow")
                .select("SUM(escrow.amount)", "total")
                .where("escrow.status IN (:...statuses)", { 
                    statuses: [EscrowStatus.PAID, EscrowStatus.PENDING, EscrowStatus.PAYMENT_INITIATED] 
                })
                .getRawOne();

            const revenueResult = await transRepo
                .createQueryBuilder("transaction")
                .select("SUM(transaction.amount)", "total")
                .where("transaction.status = :status", { status: "success" })
                .getRawOne();

            const recentTransactions = await transRepo.find({
                relations: ["user"],
                order: { createdAt: "DESC" },
                take: 5
            });

            return this.responseData(HttpStatus.OK, false, "Stats fetched successfully", {
                totalUsers,
                totalProfessionals,
                totalTransactions,
                totalBookings,
                pendingVerifications,
                totalEscrowBalance: parseFloat(activeEscrowResult?.total || "0"),
                totalRevenue: parseFloat(revenueResult?.total || "0"),
                recentTransactions
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getTransactions(page: number = 1, limit: number = 20) {
        try {
            const transRepo = AppDataSource.getRepository(Transaction);
            const [transactions, total] = await transRepo.findAndCount({
                relations: ["user", "professional"],
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "DESC" },
            });

            return this.responseData(HttpStatus.OK, false, "Transactions fetched successfully", {
                transactions,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getBookings(page: number = 1, limit: number = 20) {
        try {
            const bookingRepo = AppDataSource.getRepository(Booking);
            const [bookings, total] = await bookingRepo.findAndCount({
                relations: ["user", "professional", "services"],
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "DESC" },
            });

            return this.responseData(HttpStatus.OK, false, "Bookings fetched successfully", {
                bookings,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getBookingDetails(id: string) {
        try {
            const bookingRepo = AppDataSource.getRepository(Booking);
            const booking = await bookingRepo.findOne({
                where: { id },
                relations: ["user", "professional", "services", "escrow", "reviews"],
            });

            if (!booking) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Booking not found");
            }

            return this.responseData(HttpStatus.OK, false, "Booking details fetched successfully", booking);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getTransactionDetails(id: string) {
        try {
            const transRepo = AppDataSource.getRepository(Transaction);
            const transaction = await transRepo.findOne({
                where: { id },
                relations: ["user", "professional", "booking"],
            });

            if (!transaction) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Transaction not found");
            }

            return this.responseData(HttpStatus.OK, false, "Transaction details fetched successfully", transaction);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getUserDetails(id: string) {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOne({
                where: { id },
                // Add relations if needed
            });

            if (!user) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "User not found");
            }

            return this.responseData(HttpStatus.OK, false, "User details fetched successfully", user);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getProfessionalDetails(id: string) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const professional = await proRepo.findOne({
                where: { id },
                // Add relations if needed
            });

            if (!professional) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Professional not found");
            }

            return this.responseData(HttpStatus.OK, false, "Professional details fetched successfully", professional);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async createAdmin(adminData: any) {
        try {
            const adminRepo = AppDataSource.getRepository(Admin);
            
            const existingAdmin = await adminRepo.findOneBy({ email: adminData.email });
            if (existingAdmin) {
                return this.responseData(HttpStatus.CONFLICT, true, "Admin with this email already exists");
            }

            const hashedPassword = Password.hashPassword(adminData.password, this.storedSalt);
            const admin = adminRepo.create({
                ...adminData,
                password: hashedPassword,
                permissions: adminData.permissions || [],
                isActive: true,
            });

            await adminRepo.save(admin);

            return this.responseData(HttpStatus.CREATED, false, "Admin created successfully", {
                ...admin,
                password: undefined,
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async deleteUser(id: string) {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOneBy({ id });
            if (!user) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "User not found");
            }
            await userRepo.remove(user); // Wait, depending on cascades this might cause issues, but hard delete was requested
            return this.responseData(HttpStatus.OK, false, "User successfully deleted");
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getPlatformSettings() {
        try {
            const settingsRepo = AppDataSource.getRepository(PlatformSetting);
            let settings = await settingsRepo.findOne({ where: {} }); // Assume 1 global row
            if (!settings) {
                // Initialize default
                settings = settingsRepo.create({ platformFeePercentage: 10, fixedFee: 0 });
                await settingsRepo.save(settings!);
            }
            return this.responseData(HttpStatus.OK, false, "Platform Settings fetched", settings);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async updatePlatformSettings(data: any) {
        try {
            const settingsRepo = AppDataSource.getRepository(PlatformSetting);
            let settings = await settingsRepo.findOne({ where: {} });
            if (!settings) {
                settings = settingsRepo.create({
                    platformFeePercentage: data.platformFeePercentage,
                    fixedFee: data.fixedFee
                });
            } else {
                if (data.platformFeePercentage !== undefined) settings.platformFeePercentage = data.platformFeePercentage;
                if (data.fixedFee !== undefined) settings.fixedFee = data.fixedFee;
            }
            await settingsRepo.save(settings!);
            return this.responseData(HttpStatus.OK, false, "Platform Settings updated", settings);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getDisputes(page: number = 1, limit: number = 20) {
        try {
            const disputeRepo = AppDataSource.getRepository(Dispute);
            const [disputes, total] = await disputeRepo.findAndCount({
                relations: ["transaction", "transaction.user", "transaction.professional", "transaction.escrow", "transaction.escrow.booking"],
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "DESC" },
            });

            return this.responseData(HttpStatus.OK, false, "Disputes fetched successfully", {
                disputes,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async resolveDispute(id: string, action: 'refund_user' | 'release_to_provider') {
        try {
            const disputeRepo = AppDataSource.getRepository(Dispute);
            const escrowRepo = AppDataSource.getRepository(Escrow);
            const dispute = await disputeRepo.findOne({
                where: { id },
                relations: ["transaction", "transaction.escrow"]
            });

            if (!dispute) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Dispute not found");
            }

            if (dispute.status !== DisputeStatus.OPEN) {
                return this.responseData(HttpStatus.BAD_REQUEST, true, "Dispute is already resolved");
            }

            const escrow = dispute.transaction?.escrow;
            if (!escrow) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "No Escrow found attached to this dispute's transaction");
            }

            if (action === "refund_user") {
                dispute.status = DisputeStatus.WON; // Customer Won
                escrow.status = EscrowStatus.CANCELLED;
                escrow.refundStatus = RefundStatus.PENDING;
                
                await disputeRepo.save(dispute);
                await escrowRepo.save(escrow);
                
                // Real implementation would also trigger the refund via payment gateway here securely

                return this.responseData(HttpStatus.OK, false, "Dispute resolved in favor of customer. Refund pending.");
            } else if (action === "release_to_provider") {
                dispute.status = DisputeStatus.LOST; // Customer Lost
                escrow.status = EscrowStatus.RELEASED; // Or PAID
                
                await disputeRepo.save(dispute);
                await escrowRepo.save(escrow);
                
                // Real implementation would trigger the escrow push to Provider's Wallet here
                
                return this.responseData(HttpStatus.OK, false, "Dispute resolved in favor of provider. Funds releasing.");
            } else {
                return this.responseData(HttpStatus.BAD_REQUEST, true, "Invalid action");
            }

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
}
