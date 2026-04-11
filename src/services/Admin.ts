import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Professional } from "../entities/Professional";
import { Transaction, TransactionStatus } from "../entities/Transaction";
import { Booking } from "../entities/Booking";
import { Admin } from "../entities/Admin";
import { Escrow, EscrowStatus, RefundStatus } from "../entities/Escrow";
import { PlatformSetting } from "../entities/PlatformSetting";
import { Dispute, DisputeStatus } from "../entities/Dispute";
import { Broadcast, BroadcastType } from "../entities/Broadcast";
import { Review } from "../entities/Review";
import Service from "./Service";
import { HttpStatus } from "../types/constants";
import { Like, MoreThanOrEqual, Or } from "typeorm";
import { ActivityLog } from "../entities/ActivityLog";
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

    public async toggleUserStatus(id: string, isActive: boolean, adminId?: string) {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOneBy({ id });

            if (!user) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "User not found");
            }

            user.isActive = isActive;
            await userRepo.save(user);

            await this.logActivity(adminId, "USER_STATUS_TOGGLED", { userId: id, isActive, email: user.email });

            return this.responseData(HttpStatus.OK, false, `User ${isActive ? 'activated' : 'deactivated'} successfully`, user);
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

    public async toggleProfessionalStatus(id: string, isActive: boolean, adminId?: string) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const professional = await proRepo.findOneBy({ id });

            if (!professional) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Professional not found");
            }

            professional.isActive = isActive;
            await proRepo.save(professional);

            await this.logActivity(adminId, "PROFESSIONAL_STATUS_TOGGLED", { proId: id, isActive, email: professional.email });

            return this.responseData(HttpStatus.OK, false, `Professional ${isActive ? 'activated' : 'deactivated'} successfully`, professional);
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

    public async verifyProfessional(id: string, isVerified: boolean, adminId?: string) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const professional = await proRepo.findOneBy({ id });

            if (!professional) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Professional not found");
            }

            professional.isVerified = isVerified;
            await proRepo.save(professional);

            await this.logActivity(adminId, "PROFESSIONAL_VERIFIED", { proId: id, isVerified, email: professional.email });

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
                .where("transaction.status = :status", { status: TransactionStatus.SUCCESS })
                .getRawOne();

            const recentTransactions = await transRepo.find({
                relations: ["user"],
                order: { createdAt: "DESC" },
                take: 5
            });

            // Analytics: Monthly trends (Last 6 months)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
            sixMonthsAgo.setDate(1); // Start of month

            const bookingsForAnalytic = await bookingRepo.find({
                where: { createdAt: MoreThanOrEqual(sixMonthsAgo) },
                select: ["createdAt"]
            });

            const transactionsForAnalytic = await transRepo.find({
                where: {
                    createdAt: MoreThanOrEqual(sixMonthsAgo),
                    status: TransactionStatus.SUCCESS
                },
                select: ["createdAt", "amount"]
            });

            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const analytics: any[] = [];

            for (let i = 0; i < 6; i++) {
                const date = new Date();
                date.setMonth(date.getMonth() - (5 - i));
                const monthName = months[date.getMonth()];
                const monthNum = date.getMonth();
                const year = date.getFullYear();

                const monthBookings = bookingsForAnalytic.filter(b => {
                    const d = new Date(b.createdAt);
                    return d.getMonth() === monthNum && d.getFullYear() === year;
                }).length;

                const monthRevenue = transactionsForAnalytic.filter(t => {
                    const d = new Date(t.createdAt);
                    return d.getMonth() === monthNum && d.getFullYear() === year;
                }).reduce((sum, t) => sum + parseFloat(t.amount as any || 0), 0);

                analytics.push({
                    month: monthName,
                    bookings: monthBookings,
                    revenue: monthRevenue
                });
            }

            return this.responseData(HttpStatus.OK, false, "Stats fetched successfully", {
                totalUsers,
                totalProfessionals,
                totalTransactions,
                totalBookings,
                pendingVerifications,
                totalEscrowBalance: parseFloat(activeEscrowResult?.total || "0"),
                totalRevenue: parseFloat(revenueResult?.total || "0"),
                recentTransactions,
                analytics
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
                relations: ["user", "professional", "services", "escrow"],
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
                relations: ["wallet", "setting"]
            });

            if (!user) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "User not found");
            }

            const bookingRepo = AppDataSource.getRepository(Booking);
            const bookings = await bookingRepo.find({
                where: { user: { id } },
                relations: ["professional", "services"],
                order: { createdAt: "DESC" }
            });

            const reviewRepo = AppDataSource.getRepository(Review);
            const reviews = await reviewRepo.find({
                where: { user: { id } },
                relations: ["professional"],
                order: { createdAt: "DESC" }
            });

            return this.responseData(HttpStatus.OK, false, "User details fetched successfully", {
                ...user,
                bookings,
                reviews
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getProfessionalDetails(id: string) {
        try {
            const proRepo = AppDataSource.getRepository(Professional);
            const professional = await proRepo.findOne({
                where: { id },
                relations: ["wallet", "setting", "schedules", "account", "ratingAggregate"]
            });

            if (!professional) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Professional not found");
            }

            const bookingRepo = AppDataSource.getRepository(Booking);
            const bookings = await bookingRepo.find({
                where: { professional: { id } },
                relations: ["user", "services"],
                order: { createdAt: "DESC" }
            });

            const reviewRepo = AppDataSource.getRepository(Review);
            const reviews = await reviewRepo.find({
                where: { professional: { id } },
                relations: ["user"],
                order: { createdAt: "DESC" }
            });

            return this.responseData(HttpStatus.OK, false, "Professional details fetched successfully", {
                ...professional,
                bookings,
                reviews
            });
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

    public async updatePlatformSettings(data: any, adminId: any) {
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

    public async resolveDispute(id: string, action: 'refund_user' | 'release_to_provider', adminId?: string) {
        try {
            const disputeRepo = AppDataSource.getRepository(Dispute);
            const escrowRepo = AppDataSource.getRepository(Escrow);

            const dispute = await disputeRepo.findOne({ where: { id }, relations: ["transaction", "transaction.escrow"] });
            if (!dispute) return this.responseData(HttpStatus.NOT_FOUND, true, "Dispute not found");

            const escrow = dispute.transaction?.escrow;
            if (!escrow) return this.responseData(HttpStatus.NOT_FOUND, true, "Linked escrow not found");

            if (action === "refund_user") {
                dispute.status = DisputeStatus.WON; // Customer Won
                escrow.status = EscrowStatus.CANCELLED;
                escrow.refundStatus = RefundStatus.PENDING;

                await disputeRepo.save(dispute);
                await escrowRepo.save(escrow);

                await this.logActivity(adminId, "DISPUTE_RESOLVED_REFUND", { disputeId: id, action });
                return this.responseData(HttpStatus.OK, false, "Dispute resolved in favor of customer. Refund pending.");
            } else if (action === "release_to_provider") {
                dispute.status = DisputeStatus.LOST; // Customer Lost
                escrow.status = EscrowStatus.RELEASED; // Or PAID

                await disputeRepo.save(dispute);
                await escrowRepo.save(escrow);

                await this.logActivity(adminId, "DISPUTE_RESOLVED_RELEASE", { disputeId: id, action });
                return this.responseData(HttpStatus.OK, false, "Dispute resolved in favor of provider. Funds releasing.");
            } else {
                return this.responseData(HttpStatus.BAD_REQUEST, true, "Invalid action");
            }

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getDisputeDetails(id: string) {
        try {
            const disputeRepo = AppDataSource.getRepository(Dispute);
            const dispute = await disputeRepo.findOne({
                where: { id },
                relations: ["transaction", "transaction.user", "transaction.professional", "transaction.escrow", "transaction.escrow.booking"],
            });

            if (!dispute) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Dispute not found");
            }

            return this.responseData(HttpStatus.OK, false, "Dispute details fetched successfully", dispute);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async broadcast(data: {
        type: string;
        targets: string;
        content: string;
        subject?: string;
        title?: string;
        targetUserId?: string;
        attachments?: { content: string; name: string }[]
    }, adminId?: string) {
        try {
            const { type, targets, content, subject, title, targetUserId, attachments } = data;

            // 1. Save broadcast to history
            const broadcastRepo = AppDataSource.getRepository(Broadcast);
            const broadcast = broadcastRepo.create({
                type: type as BroadcastType,
                targets: targetUserId ? `Single User (${targets})` : targets,
                title: (type === 'email' ? subject : title) || null,
                content: content
            } as any);
            await broadcastRepo.save(broadcast);

            // 2. Publish to Queue
            const queueName = "victhon_notification_queue";
            let eventType = type === "email" ? "notification.broadcast_email" : "notification.broadcast_push";

            let payload: any = { targets, content, targetUserId, attachments };
            if (type === "email") {
                payload.subject = subject;
            } else if (type === "push") {
                payload.title = title;
            } else {
                return this.responseData(HttpStatus.OK, true, "Invalid broadcast type");
            }

            const { RabbitMQ } = require("./RabbitMQ");

            // CRITICAL: The consumer expects eventType to be INSIDE the message payload for routing
            await RabbitMQ.publishToExchange(queueName, eventType, {
                eventType,
                payload
            });

            // 3. Log Activity
            await this.logActivity(adminId, "BROADCAST_SENT", {
                type,
                targets: targetUserId || targets,
                hasAttachments: !!attachments?.length
            });

            return this.responseData(HttpStatus.OK, false, `Broadcast queued successfully`, broadcast);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getCommunicationStats() {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const proRepo = AppDataSource.getRepository(Professional);

            const totalUsers = await userRepo.count();
            const totalProfessionals = await proRepo.count();

            return this.responseData(HttpStatus.OK, false, "Communication stats fetched", {
                totalAudience: totalUsers + totalProfessionals,
                totalUsers,
                totalProfessionals
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getBroadcastLogs(page: number = 1, limit: number = 10) {
        try {
            const broadcastRepo = AppDataSource.getRepository(Broadcast);
            const [broadcasts, total] = await broadcastRepo.findAndCount({
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "DESC" }
            });

            return this.responseData(HttpStatus.OK, false, "Broadcast logs fetched", {
                broadcasts,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async searchUsers(query: string) {
        try {
            const userRepo = AppDataSource.getRepository(User);
            const proRepo = AppDataSource.getRepository(Professional);

            const users = await userRepo.find({
                where: [
                    { firstName: Like(`%${query}%`) },
                    { lastName: Like(`%${query}%`) },
                    { email: Like(`%${query}%`) }
                ],
                take: 10
            });

            const pros = await proRepo.find({
                where: [
                    { firstName: Like(`%${query}%`) },
                    { lastName: Like(`%${query}%`) },
                    { email: Like(`%${query}%`) },
                    { businessName: Like(`%${query}%`) }
                ],
                take: 10
            });

            const results = [
                ...users.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email, type: 'user' })),
                ...pros.map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, email: p.email, type: 'professional' }))
            ];

            return this.responseData(HttpStatus.OK, false, "Search results fetched", results);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async logActivity(adminId: string | undefined, action: string, details: any, ip?: string) {
        try {
            const logRepo = AppDataSource.getRepository(ActivityLog);
            const log = logRepo.create({
                adminId: adminId || null,
                action,
                details,
                ipAddress: ip || null
            } as any);
            await logRepo.save(log);
        } catch (error) {
            console.error("Failed to log activity:", error);
        }
    }

    public async getActivityLogs(page: number = 1, limit: number = 20) {
        try {
            const logRepo = AppDataSource.getRepository(ActivityLog);
            const [logs, total] = await logRepo.findAndCount({
                relations: ["admin"],
                skip: (page - 1) * limit,
                take: limit,
                order: { createdAt: "DESC" }
            });

            return this.responseData(HttpStatus.OK, false, "Activity logs fetched", {
                logs,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
}
