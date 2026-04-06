import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Professional } from "../entities/Professional";
import { Transaction } from "../entities/Transaction";
import { Booking } from "../entities/Booking";
import Service from "./Service";
import { HttpStatus } from "../types/constants";

export default class AdminService extends Service {
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

            const totalUsers = await userRepo.count();
            const totalProfessionals = await proRepo.count();
            const totalTransactions = await transRepo.count();
            const totalBookings = await bookingRepo.count();

            // Simplified revenue calculation
            const revenueResult = await transRepo
                .createQueryBuilder("transaction")
                .select("SUM(transaction.amount)", "total")
                .where("transaction.status = :status", { status: "success" }) // Adjust status if needed
                .getRawOne();

            return this.responseData(HttpStatus.OK, false, "Stats fetched successfully", {
                totalUsers,
                totalProfessionals,
                totalTransactions,
                totalBookings,
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
}
