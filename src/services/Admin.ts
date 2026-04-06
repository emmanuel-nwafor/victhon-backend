import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Professional } from "../entities/Professional";
import { Transaction } from "../entities/Transaction";
import { Booking } from "../entities/Booking";
import { Admin } from "../entities/Admin";
import { Escrow, EscrowStatus } from "../entities/Escrow";
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

            return this.responseData(HttpStatus.OK, false, "Stats fetched successfully", {
                totalUsers,
                totalProfessionals,
                totalTransactions,
                totalBookings,
                pendingVerifications,
                totalEscrowBalance: parseFloat(activeEscrowResult?.total || "0"),
                totalRevenue: parseFloat(revenueResult?.total || "0"),
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
}
