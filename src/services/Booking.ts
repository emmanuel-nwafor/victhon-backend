import { In, IsNull, LessThanOrEqual, MoreThanOrEqual, Not, Or } from "typeorm";
import { AppDataSource } from "../data-source";
import { Booking, BookingStatus } from "../entities/Booking";
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
        });

        if (!professional)
            return this.responseData(404, true, "Professional was not found.");

        if (!professional.availability)
            return this.responseData(400, true, "Professional is unavailable.");

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
                    throw new Error("Current booking overlaps with existing booking");
                }

                // --- Step 3: Validate schedule ---
                const isAvailable = await this.isResourceAvailableInSchedule(
                    manager,
                    professionalId,
                    startDateTime,
                    endDateTime,
                );

                if (!isAvailable) {
                    throw new Error("Professional not available at requested time");
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

                // --- Step 4: Create booking ---
                const booking = manager.create(Booking, {
                    userId,
                    professionalId,
                    status: BookingStatus.PENDING,
                    startDateTime,
                    endDateTime,
                    // location,
                    amount: totalPrice,
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

            try {
                await notify({
                    userId: professionalId,
                    userType: UserType.PROFESSIONAL,
                    type: NotificationType.BOOKING,
                    data: data,
                });
            } catch (notifyError) {
                console.error("Failed to send booking notification:", notifyError);
            }

            return this.responseData(
                201,
                false,
                "Professional was booked successfully",
                data,
            );
        } catch (error) {
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
        const startDate = this.toDateOnly(start);
        const startTime = this.toTimeOnly(start);
        const endTime = this.toTimeOnly(end);
        const dayName = start
            .toLocaleString("en-us", { weekday: "long" })
            .toLowerCase();

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
        return date.toISOString().split("T")[0];
    }

    private toTimeOnly(date: Date) {
        return date.toISOString().split("T")[1]?.slice(0, 12); // 'HH:mm:ss.sss'
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
                (booking.professional as any).longitude = parseFloat(coords[0] || "0");
                (booking.professional as any).latitude = parseFloat(coords[1] || "0");
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
                (booking.professional as any).longitude = parseFloat(coords[0] || "0");
                (booking.professional as any).latitude = parseFloat(coords[1] || "0");
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

            // Check if professional profile is complete
            const isProfileComplete = await this.isProfileComplete(proId);
            if (!isProfileComplete) {
                return this.responseData(HttpStatus.FORBIDDEN, true, "Professional has not completed their business profile setup.");
            }

            if (booking.status !== BookingStatus.PENDING)
                return this.responseData(400, true, `This booking can't be accepted`);

            booking.status = BookingStatus.ACCEPTED;
            const updatedBooking = await this.repo.save(booking);

            try {
                await notify({
                    userId: booking.userId,
                    userType: UserType.USER,
                    type: NotificationType.ACCEPTED_BOOKING,
                    data: { ...updatedBooking, user: undefined },
                });
            } catch (notifyError) {
                console.error("Failed to send acceptance notification:", notifyError);
            }
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

            try {
                await notify({
                    userId: booking.userId,
                    userType: UserType.USER,
                    type: NotificationType.REJECTED_BOOKING,
                    data: { ...updatedBooking, user: undefined },
                });
            } catch (notifyError) {
                console.error("Failed to send rejection notification:", notifyError);
            }

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

            if (!booking)
                return this.responseData(404, true, "Booking was not found");

            if (
                ![BookingStatus.ACCEPTED, BookingStatus.REVIEW, BookingStatus.ON_THE_WAY].includes(booking.status)
            )
                return this.responseData(
                    400,
                    true,
                    `This booking can't be put for review`,
                );

            booking.status = BookingStatus.REVIEW;
            const updatedBooking = await this.repo.save(booking);

            try {
                await notify({
                    userId: booking.userId,
                    userType: UserType.USER,
                    type: NotificationType.REVIEW_BOOKING,
                    data: { ...updatedBooking, user: undefined },
                });
            } catch (notifyError) {
                console.error("Failed to send review notification:", notifyError);
            }

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

            if (booking.status !== BookingStatus.ACCEPTED)
                return this.responseData(400, true, "Booking must be accepted first.");

            const hasOnsite = booking.services.some(s => s.onsiteLocationService);
            if (!hasOnsite)
                return this.responseData(400, true, "This service does not support live tracking.");

            booking.status = BookingStatus.ON_THE_WAY;
            const updatedBooking = await this.repo.save(booking);

            try {
                await notify({
                    userId: booking.userId,
                    userType: UserType.USER,
                    type: NotificationType.BOOKING,
                    data: { ...updatedBooking, services: undefined },
                });
            } catch (notifyError) {
                console.error("Failed to send start moving notification:", notifyError);
            }

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

                // Allow completion from REVIEW, ACCEPTED, or ON_THE_WAY status
                if (
                    ![BookingStatus.REVIEW, BookingStatus.ACCEPTED, BookingStatus.ON_THE_WAY].includes(
                        booking.status,
                    )
                ) {
                    throw new Error("Booking cannot be completed");
                }

                if (booking.escrow.status !== EscrowStatus.PAID) {
                    throw new Error("Booking has not been paid yet");
                }

                if (booking.escrow.refundStatus !== RefundStatus.NONE) {
                    throw new Error("Booking cannot be completed");
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

    public async disputeBooking(bookingId: string, userId: string, reason?: string) {
        try {
            const booking = await this.repo.findOne({
                where: { id: bookingId, userId },
                relations: ["escrow"],
            });

            if (!booking) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Booking not found");
            }

            if (booking.status !== BookingStatus.REVIEW && booking.status !== BookingStatus.ACCEPTED && booking.status !== BookingStatus.ON_THE_WAY) {
                return this.responseData(HttpStatus.BAD_REQUEST, true, "Booking cannot be disputed at this stage");
            }

            if (booking.escrow.status !== EscrowStatus.PAID) {
                return this.responseData(HttpStatus.BAD_REQUEST, true, "Booking has not been paid yet");
            }

            // Payment service handles the heavy lifting of updates to escrow, transactions, and wallet
            const paymentService = new Payment();
            const result = await paymentService.dispute(booking.id, reason);

            if (!result) {
                return this.responseData(HttpStatus.INTERNAL_SERVER_ERROR, true, "Could not process dispute");
            }

            return this.responseData(HttpStatus.OK, false, "Booking has been disputed successfully", result);
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
}