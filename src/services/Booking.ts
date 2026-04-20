import { In, IsNull, LessThan, LessThanOrEqual, MoreThanOrEqual, Not, Or } from "typeorm";
import { AppDataSource } from "../data-source";
import { Booking, BookingStatus } from "../entities/Booking";
import { PlatformSetting } from "../entities/PlatformSetting";
import { Escrow, EscrowStatus, RefundStatus } from "../entities/Escrow";
import { NotificationType } from "../entities/Notification";
import { Professional } from "../entities/Professional";
import {
    DayOfWeek,
    ProfessionalSchedule,
} from "../entities/ProfessionalSchedule";
import { ServiceEntity } from "../entities/ServiceEntity";
import {
    HttpStatus,
    QueueEvents,
    QueueNames,
    UserType,
} from "../types/constants";
import notify from "./notify";
import Payment from "./Payment";
import { RabbitMQ } from "./RabbitMQ";
import Service from "./Service";
import logger from "../config/logger";

export default class BookingService extends Service {
    private readonly repo = AppDataSource.getRepository(Booking);
    private readonly professionalRepo = AppDataSource.getRepository(Professional);
    private scheduleRepo = AppDataSource.getRepository(ProfessionalSchedule);
    private serviceRepo = AppDataSource.getRepository(ServiceEntity);

    public async createBooking(input: {
        userId: string;
        professionalId: string;
        startDateTime: Date;
        endDateTime: Date;
        serviceIds: string[];
        address?: string;
    }) {
        const {
            userId,
            professionalId,
            startDateTime,
            endDateTime,
            serviceIds,
            address,
            // longitude,
            // latitude
        } = input;

        const professional = await this.professionalRepo.findOne({
            where: { id: professionalId },
            relations: ["setting"],
        });

        if (!professional)
            return this.responseData(404, true, "Professional was not found.");

        if (!professional.availability)
            return this.responseData(400, true, "Professional is unavailable.");

        if (professional.setting && professional.setting.bookingRequestsEnabled === false)
            return this.responseData(400, true, "This professional is currently not accepting booking requests.");

        // Check if professional profile is complete
        const isProfileComplete = await this.isProfileComplete(professionalId);
        if (!isProfileComplete) {
            return this.responseData(HttpStatus.FORBIDDEN, true, "Professional has not completed their business profile setup.");
        }

        let serviceExists = await this.serviceRepo.find({
            where: { id: In(serviceIds), professionalId: professionalId },
        });
        if (!serviceExists || serviceExists.length < serviceIds.length)
            return this.responseData(
                HttpStatus.BAD_REQUEST,
                true,
                `Invalid services.`,
                serviceExists,
            );

        // --- Step 1: Validate input ---
        if (startDateTime >= endDateTime)
            return this.responseData(400, true, "Start time must be before end time");

        try {
            // --- Step 2: Atomic transaction with row locking ---
            const data = await AppDataSource.transaction(async (manager) => {
                // Lock existing bookings for this resource
                const existingBookings = await manager.find(Booking, {
                    where: {
                        professionalId,
                        status: Not(
                            In([
                                BookingStatus.CANCELLED,
                                BookingStatus.COMPLETED,
                                BookingStatus.REJECTED,
                            ]),
                        ),
                        startDateTime: LessThanOrEqual(endDateTime),
                        endDateTime: MoreThanOrEqual(startDateTime),
                    },
                    lock: { mode: "pessimistic_write" }, // FOR UPDATE
                });

                if (existingBookings.length > 0) {
                    const schedule = await manager.find(ProfessionalSchedule, {
                        where: { professionalId, isActive: true },
                        order: { dayOfWeek: "ASC", startTime: "ASC" }
                    });
                    throw {
                        message: "Current booking overlaps with existing booking",
                        data: { schedule },
                        statusCode: 409
                    };
                }

                // --- Step 3: Validate schedule ---
                const isAvailable = await this.isResourceAvailableInSchedule(
                    manager,
                    professionalId,
                    startDateTime,
                    endDateTime,
                );

                if (!isAvailable) {
                    const schedule = await manager.find(ProfessionalSchedule, {
                        where: { professionalId, isActive: true },
                        order: { dayOfWeek: "ASC", startTime: "ASC" }
                    });
                    throw {
                        message: "Professional not available at requested time",
                        data: { schedule },
                        statusCode: 409
                    };
                }

                // const location = (longitude && latitude ? `POINT(${longitude} ${latitude})` : `POINT(${0} ${0})`) as any;

                for (const items of serviceExists) {
                    if (items.onsiteLocationService && address == null) {
                        throw new Error("Address required for this booking.");
                    }
                }

                let totalPrice = 0;
                for (const items of serviceExists) {
                    totalPrice += Number(items.price);
                }

                // Fetch platform settings for commitment fee
                const settingsRepo = manager.getRepository(PlatformSetting);
                const settings = await settingsRepo.findOne({ where: {} });
                const commitmentFee = Number(settings?.commitmentFee || 2000);

                // --- Step 4: Create booking ---
                const booking = manager.create(Booking, {
                    userId,
                    professionalId,
                    status: BookingStatus.AWAITING_COMMITMENT,
                    startDateTime,
                    endDateTime,
                    // location,
                    amount: totalPrice,
                    commitmentFee,
                    isChatUnlocked: false,
                    ...(address && { address }),
                });

                // Assign packages array
                booking.services = serviceExists;

                const escrow = new Escrow();
                escrow.amount = Number(booking.amount);
                escrow.status = EscrowStatus.PENDING;
                escrow.description = `Escrow for booking`;

                booking.escrow = escrow;
                return await manager.save(booking);
            });



            return this.responseData(
                201,
                false,
                "Professional was booked successfully",
                data,
            );
        } catch (error: any) {
            console.error("[BOOKING_SERVICE] createBooking failed:", error);
            if (error.statusCode === 409) {
                return this.responseData(409, true, error.message, error.data);
            }
            return this.handleTypeormError(error);
        }
    }

    /**
     * Check if resource is available per its schedule
     */
    private async isResourceAvailableInSchedule(
        manager: any,
        professionalId: string,
        start: Date,
        end: Date,
    ): Promise<boolean> {
        // Nigeria is WAT (UTC+1). Shift UTC dates to WAT for comparison with local schedule rules.
        const watStart = new Date(start.getTime() + 3600000);
        const watEnd = new Date(end.getTime() + 3600000);

        const startDate = watStart.toISOString().split("T")[0];
        const startTime = watStart.toISOString().split("T")[1]?.slice(0, 12) || "";
        const endTime = watEnd.toISOString().split("T")[1]?.slice(0, 12) || "";
        
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = days[watStart.getUTCDay()];

        const schedules = await manager.find(ProfessionalSchedule, {
            where: {
                professionalId,
                isActive: true,
                dayOfWeek: dayName as DayOfWeek,
                startTime: LessThanOrEqual(startTime),
                endTime: MoreThanOrEqual(endTime),
                // Optional date range
                validFrom: Or(IsNull(), LessThanOrEqual(startDate)),
                validUntil: Or(IsNull(), MoreThanOrEqual(startDate)),
            },
        });

        return schedules.length > 0;
    }

    // --- Helpers ---
    private toDateOnly(date: Date) {
        const wat = new Date(date.getTime() + 3600000);
        return wat.toISOString().split("T")[0];
    }

    private toTimeOnly(date: Date) {
        const wat = new Date(date.getTime() + 3600000);
        return wat.toISOString().split("T")[1]?.slice(0, 12); // 'HH:mm:ss.sss'
    }

    async updateBooking(
        bookingId: string,
        updates: Partial<{
            startDateTime: Date;
            endDateTime: Date;
            status: BookingStatus;
        }>,
    ) {
        try {
            const data = await AppDataSource.transaction(async (manager) => {
                const booking = await manager.findOneOrFail(Booking, {
                    where: { id: bookingId },
                    lock: { mode: "pessimistic_write" },
                });

                // Allow cancellation without schedule check
                if (
                    updates.status &&
                    ["cancelled", "no_show"].includes(updates.status)
                ) {
                    Object.assign(booking, updates);
                    return await manager.save(booking);
                }

                const newStart = updates.startDateTime || booking.startDateTime;
                const newEnd = updates.endDateTime || booking.endDateTime;

                // Re-check overlap (exclude self)
                const conflicts = await manager.find(Booking, {
                    where: {
                        professionalId: booking.professionalId,
                        id: Not(booking.id),
                        status: Not(In(["cancelled", "no_show"])),
                        startDateTime: LessThanOrEqual(newEnd),
                        endDateTime: MoreThanOrEqual(newStart),
                    },
                    lock: { mode: "pessimistic_write" },
                });

                if (conflicts.length > 0) {
                    throw new Error("Update would cause overlap");
                }

                // Re-check schedule
                const available = await this.isResourceAvailableInSchedule(
                    manager,
                    booking.professionalId,
                    newStart,
                    newEnd,
                );

                if (!available) {
                    throw new Error("Resource not available at new time");
                }

                Object.assign(booking, updates);
                return await manager.save(booking);
            });
            return this.responseData(
                200,
                false,
                "Booking was updated successfully",
                data,
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getProBooking(bookingId: string, proId: string) {
        try {
            const booking = await this.repo.findOne({
                where: {
                    id: bookingId,
                    professionalId: proId,
                },
                relations: ["user", "services"],
            });

            if (!booking)
                return this.responseData(404, true, "Booking was not found");

            // Parse professional location if it exists
            if (booking.professional && (booking.professional as any).location) {
                const coords = ((booking.professional as any).location as string)
                    .replace("POINT(", "")
                    .replace(")", "")
                    .split(" ");

                if (!booking.isChatUnlocked) {
                    (booking.professional as any).longitude = 0;
                    (booking.professional as any).latitude = 0;
                } else {
                    (booking.professional as any).longitude = parseFloat(coords[0] || "0");
                    (booking.professional as any).latitude = parseFloat(coords[1] || "0");
                }
            }

            if (!booking.isChatUnlocked) {
                booking.address = "Hidden until commitment fee is paid";
            }

            return this.responseData(
                200,
                false,
                "Booking has been retrieved successfully",
                booking,
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getUserBooking(bookingId: string, userId: string) {
        try {
            const booking = await this.repo.findOne({
                where: {
                    id: bookingId,
                    userId: userId,
                },
                relations: ["professional", "services"],
            });

            if (!booking)
                return this.responseData(404, true, "Booking was not found");

            // Parse professional location if it exists
            if (booking.professional && (booking.professional as any).location) {
                const coords = ((booking.professional as any).location as string)
                    .replace("POINT(", "")
                    .replace(")", "")
                    .split(" ");

                if (!booking.isChatUnlocked) {
                    (booking.professional as any).longitude = 0;
                    (booking.professional as any).latitude = 0;
                } else {
                    (booking.professional as any).longitude = parseFloat(coords[0] || "0");
                    (booking.professional as any).latitude = parseFloat(coords[1] || "0");
                }
            }

            return this.responseData(
                200,
                false,
                "Booking has been retrieved successfully",
                booking,
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async acceptBooking(bookingId: string, proId: string) {
        try {
            const booking = await this.repo.findOne({
                where: {
                    id: bookingId,
                    professionalId: proId,
                },
                relations: ["professional", "user"],
            });

            if (!booking)
                return this.responseData(404, true, "Booking was not found");

            if (booking.status !== BookingStatus.PENDING) {
                return this.responseData(400, true, `This booking is already ${booking.status.replace('_', ' ')}.`);
            }

            // Check if professional profile is complete
            const isProfileComplete = await this.isProfileComplete(proId);
            if (!isProfileComplete) {
                return this.responseData(HttpStatus.FORBIDDEN, true, "Professional has not completed their business profile setup.");
            }

            booking.status = BookingStatus.ACCEPTED;
            const updatedBooking = await this.repo.save(booking);

            // Non-blocking notification
            notify({
                userId: booking.userId,
                userType: UserType.USER,
                type: NotificationType.ACCEPTED_BOOKING,
                data: { ...updatedBooking, user: undefined },
            }).catch(err => console.error("[BOOKING_FLOW] Failed to queue acceptance notification:", err));
            return this.responseData(
                200,
                false,
                "Booking has been accepted successfully",
                {
                    ...updatedBooking,
                    professional: undefined,
                },
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async rejectBooking(bookingId: string, proId: string) {
        try {
            const booking = await this.repo.findOne({
                where: {
                    id: bookingId,
                    professionalId: proId,
                },
                relations: ["professional", "user"],
            });

            if (!booking)
                return this.responseData(404, true, "Booking was not found");
            if (booking.status !== BookingStatus.PENDING)
                return this.responseData(400, true, `This booking can't be rejected`);

            booking.status = BookingStatus.REJECTED;
            const updatedBooking = await this.repo.save(booking);

            // Non-blocking notification
            notify({
                userId: booking.userId,
                userType: UserType.USER,
                type: NotificationType.REJECTED_BOOKING,
                data: { ...updatedBooking, user: undefined },
            }).catch(err => console.error("[BOOKING_FLOW] Failed to queue rejection notification:", err));

            return this.responseData(
                200,
                false,
                "Booking has been rejected successfully",
                {
                    ...updatedBooking,
                    professional: undefined,
                },
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async reviewBooking(bookingId: string, proId: string) {
        try {
            const booking = await this.repo.findOne({
                where: {
                    id: bookingId,
                    professionalId: proId,
                },
                relations: ["professional", "user"],
            });

            if (!booking) {
                return this.responseData(404, true, "Booking was not found");
            }

            if (
                ![BookingStatus.ACCEPTED, BookingStatus.REVIEW, BookingStatus.ON_THE_WAY, BookingStatus.SCHEDULED].includes(booking.status as any)
            ) {
                return this.responseData(
                    400,
                    true,
                    `This booking can't be put for review (Current status: ${booking.status})`,
                );
            }

            if (booking.status === BookingStatus.REVIEW) {
                return this.responseData(200, false, "Booking is already in review", { ...booking, professional: undefined });
            }

            booking.status = BookingStatus.REVIEW;
            const updatedBooking = await this.repo.save(booking);

            // notify user of review status
            notify({
                userId: booking.userId,
                userType: UserType.USER,
                type: NotificationType.REVIEW_BOOKING,
                data: { ...updatedBooking, user: undefined },
            }).catch(err => console.error("Failed to queue review notification:", err));

            return this.responseData(
                200,
                false,
                "Booking has been updated successfully",
                {
                    ...updatedBooking,
                    professional: undefined,
                },
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async cancelBooking(bookingId: string, userId: string) {
        return await new Payment().refundBooking(bookingId, userId);
    }

    public async startMoving(bookingId: string, proId: string) {
        try {
            const booking = await this.repo.findOne({
                where: {
                    id: bookingId,
                    professionalId: proId,
                },
                relations: ["services", "user"],
            });

            if (!booking)
                return this.responseData(404, true, "Booking was not found");

            if (booking.status !== BookingStatus.ACCEPTED && booking.status !== BookingStatus.SCHEDULED)
                return this.responseData(400, true, "Booking must be accepted or scheduled first.");

            if (booking.escrow.status !== EscrowStatus.PAID)
                return this.responseData(400, true, "You can only start moving after the customer has paid for the booking.");

            const hasOnsite = booking.services.some(s => s.onsiteLocationService);
            if (!hasOnsite)
                return this.responseData(400, true, "This service does not support live tracking.");

            booking.status = BookingStatus.ON_THE_WAY;
            const updatedBooking = await this.repo.save(booking);

            // notify user that professional is on the way
            notify({
                userId: booking.userId,
                userType: UserType.USER,
                type: NotificationType.ON_THE_WAY,
                data: { ...updatedBooking, services: undefined },
            }).catch(err => console.error("Failed to queue start moving notification:", err));

            return this.responseData(200, false, "Professional is now on the way.", updatedBooking);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    private async isProfileComplete(professionalId: string): Promise<boolean> {
        const professional = await this.professionalRepo.findOne({
            where: { id: professionalId }
        });

        if (!professional) return false;

        const requiredFields = [
            'businessName',
            'businessCategory',
            'businessType',
            'ninNumber',
            'ninSlipUrl',
            'firstName',
            'lastName'
        ];

        for (const field of requiredFields) {
            if (!professional[field as keyof Professional]) {
                return false;
            }
        }

        if (!professional.profilePicture || !professional.profilePicture.url) {
            return false;
        }

        return true;
    }

    public async completeBooking(bookingId: string, userId: string) {
        try {
            const result = await AppDataSource.transaction(async (manager) => {
                const booking = await manager.findOne(Booking, {
                    where: { id: bookingId, userId },
                    relations: {
                        escrow: true,
                        professional: { wallet: true },
                    },
                    lock: { mode: "pessimistic_write" },
                });

                if (!booking) {
                    throw new Error("Booking not found");
                }

                // enforce multi-step: must be in REVIEW to complete
                if (booking.status !== BookingStatus.REVIEW) {
                    throw new Error(`Booking cannot be completed yet. The professional must first mark the service as 'Ready for Review' before you can finalize it.`);
                }

                if (booking.escrow.status !== EscrowStatus.PAID) {
                    throw new Error("Booking cannot be completed yet because payment has not been confirmed in escrow. Please ensure payment is successful.");
                }

                if (booking.escrow.refundStatus !== RefundStatus.NONE) {
                    throw new Error(`Booking cannot be completed because a refund is in state: ${booking.escrow.refundStatus}`);
                }

                booking.status = BookingStatus.COMPLETED;
                booking.escrow.status = EscrowStatus.RELEASED;

                return await manager.save(booking);
            });

            const payload = {
                escrowId: result.escrow.id,
                professionalId: result.professionalId,
                walletId: result.professional.wallet.id,
            };
            const queueName = QueueNames.WALLET;
            const eventType = QueueEvents.WALLET_ESCROW_RELEASE;
            await RabbitMQ.publishToExchange(queueName, eventType, {
                eventType: eventType,
                payload,
            });

            // notify participants of completion
            notify({
                userId: result.userId,
                userType: UserType.USER,
                type: NotificationType.COMPLETED,
                data: { ...result, professional: undefined, escrow: undefined }
            }).catch(err => console.error("Failed to notify customer of completion:", err));

            notify({
                userId: result.professionalId,
                userType: UserType.PROFESSIONAL,
                type: NotificationType.COMPLETED,
                data: { ...result, professional: undefined, escrow: undefined }
            }).catch(err => console.error("Failed to notify professional of completion:", err));

            return this.responseData(
                200,
                false,
                "Booking completed successfully",
                result,
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getProBookings(proId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const [bookings, total] = await this.repo.findAndCount({
                where: { professionalId: proId },
                skip,
                take: limit,
                order: { createdAt: "DESC" }, // sort newest first
                relations: ["user"],
            });

            const data = {
                records: bookings,
                pagination: this.pagination(page, limit, total),
            };

            return this.responseData(
                200,
                false,
                "Bookings have been retrieved successfully",
                data,
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async bookings(proId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const [bookings, total] = await this.repo.findAndCount({
                where: { professionalId: proId },
                select: {
                    id: true,
                    startDateTime: true,
                    endDateTime: true,
                    services: true,
                },
                skip,
                take: limit,
                order: { createdAt: "DESC" },
            });

            const data = {
                records: bookings,
                pagination: this.pagination(page, limit, total),
            };

            return this.responseData(
                200,
                false,
                "Bookings have been retrieved successfully",
                data,
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getUserBookings(userId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const [bookings, total] = await this.repo.findAndCount({
                where: { userId: userId },
                skip,
                take: limit,
                order: { createdAt: "DESC" }, // sort newest first
                relations: ["professional"], // optional: include related data
            });

            const data = {
                records: bookings,
                pagination: this.pagination(page, limit, total),
            };

            return this.responseData(
                200,
                false,
                "Bookings have been retrieved successfully",
                data,
            );
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async disputeBooking(bookingId: string, userId: string, reason?: string, evidenceUrls?: string[]) {
        try {
            const booking = await this.repo.findOne({
                where: { id: bookingId, userId },
                relations: ["escrow"],
            });

            if (!booking) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Booking not found");
            }

            if (booking.status !== BookingStatus.REVIEW && booking.status !== BookingStatus.ACCEPTED && booking.status !== BookingStatus.ON_THE_WAY && booking.status !== BookingStatus.SCHEDULED) {
                return this.responseData(HttpStatus.BAD_REQUEST, true, "Booking cannot be disputed at this stage");
            }

            if (booking.escrow.status !== EscrowStatus.PAID) {
                return this.responseData(HttpStatus.BAD_REQUEST, true, "Booking has not been paid yet");
            }

            // Payment service handles the heavy lifting of updates to escrow, transactions, and wallet
            const paymentService = new Payment();
            const result = await paymentService.dispute(booking.id, reason, evidenceUrls);

            if (!result) {
                return this.responseData(HttpStatus.INTERNAL_SERVER_ERROR, true, "Could not process dispute");
            }

            return this.responseData(HttpStatus.OK, false, "Booking has been disputed successfully", result);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async adjustBookingPrice(bookingId: string, proId: string, newTotalAmount: number) {
        try {
            const result = await AppDataSource.transaction(async (manager) => {
                const booking = await manager.findOne(Booking, {
                    where: { id: bookingId, professionalId: proId },
                    relations: ["escrow"],
                    lock: { mode: "pessimistic_write" },
                });

                if (!booking) throw new Error("Booking not found");
                if (![BookingStatus.CHATTING, BookingStatus.AWAITING_COMMITMENT, BookingStatus.ACCEPTED].includes(booking.status)) {
                    throw new Error("Cannot adjust price at this stage");
                }

                booking.amount = newTotalAmount;
                booking.escrow.amount = newTotalAmount;

                await manager.save([booking, booking.escrow]);
                return booking;
            });

            return this.responseData(200, false, "Booking price adjusted successfully", result);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async autoCompleteReviewBookings() {
        try {
            const seventyTwoHoursAgo = new Date();
            seventyTwoHoursAgo.setHours(seventyTwoHoursAgo.getHours() - 72);

            const bookingsToComplete = await this.repo.find({
                where: {
                    status: BookingStatus.REVIEW,
                    updatedAt: LessThanOrEqual(seventyTwoHoursAgo),
                },
                relations: ["escrow", "professional", "professional.wallet"],
            });

            console.log(`[Cron] Found ${bookingsToComplete.length} bookings to auto-complete.`);

            for (const booking of bookingsToComplete) {
                try {
                    await this.completeBooking(booking.id, booking.userId);
                    console.log(`[Cron] Auto-completed booking ${booking.id}`);
                } catch (err) {
                    console.error(`[Cron] Failed to auto-complete booking ${booking.id}:`, err);
                }
            }
        } catch (error) {
            console.error("[Cron] Error in autoCompleteReviewBookings:", error);
        }
    }

    public async autoRefundInactiveBookings() {
        try {
            // Fetch platform settings for timeout
            const settingsRepo = AppDataSource.getRepository(PlatformSetting);
            const settings = await settingsRepo.findOne({ where: {} });
            const timeoutHours = Number(settings?.autoRefundHours || 48);

            const timeoutThreshold = new Date();
            timeoutThreshold.setHours(timeoutThreshold.getHours() - timeoutHours);

            const inactiveBookings = await AppDataSource.getRepository(Booking).find({
                where: {
                    status: In([BookingStatus.AWAITING_COMMITMENT, BookingStatus.CHATTING]),
                    createdAt: LessThan(timeoutThreshold)
                },
                relations: ["user", "professional"]
            });

            for (const booking of inactiveBookings) {
                if (booking.status === BookingStatus.CHATTING && booking.isChatUnlocked) {
                    // This means they paid commitment fee but pro likely didn't respond
                    // Need a way to trigger refund via Payment service
                    // For now, mark as cancelled and log for manual review or call refund service
                    booking.status = BookingStatus.CANCELLED;
                    await AppDataSource.getRepository(Booking).save(booking);

                    logger.info(`[AUTO_REFUND] Booking ${booking.id} cancelled due to inactivity. Refund needed.`);
                    // TODO: call Payment.refundBooking(booking.id, booking.userId)
                } else if (booking.status === BookingStatus.AWAITING_COMMITMENT) {
                    booking.status = BookingStatus.CANCELLED;
                    await AppDataSource.getRepository(Booking).save(booking);
                }
            }
        } catch (error) {
            console.error("Auto-refund cron failed", error);
        }
    }
}