import { AppDataSource } from "../data-source";
import { DayOfWeek, ProfessionalSchedule } from "../entities/ProfessionalSchedule";
import { HttpStatus } from "../types/constants";
import Service from "./Service";
import { Professional as ProfessionalEntity } from "../entities/Professional";
import { DeepPartial } from "typeorm";

export default class Schedule extends Service {

    private readonly repo = AppDataSource.getRepository(ProfessionalSchedule);

    public async createSchedules(
        userId: string,
        schedules: any[]
    ) {
        try {
            const professionalRepo = AppDataSource.getRepository(ProfessionalEntity);

            let pro = await professionalRepo.findOne({ where: { id: userId } });
            if (!pro) return this.responseData(HttpStatus.NOT_FOUND, true, `Professional was not found.`);

            const data = schedules.map((s: any) => ({
                ...s,
                professionalId: userId
            }));

            // Use upsert to handle existing records based on the unique index [professionalId, dayOfWeek]
            const result = await this.repo.upsert(data, ["professionalId", "dayOfWeek"]);

            return this.responseData(HttpStatus.OK, false, `Professional schedules were updated successfully.`, result.identifiers);

        } catch (error) {
            console.error("Bulk Schedule Error:", error);
            return this.handleTypeormError(error);
        }
    }


    public async createSchedule(
        userId: string,
        dayOfWeek: DayOfWeek,
        startTime: string,
        endTime: string,
        isActive: boolean,
        validFrom: string | null = null,
        validUntil: string | null = null
    ) {
        try {
            const professionalRepo = AppDataSource.getRepository(ProfessionalEntity);

            let pro = await professionalRepo.findOne({ where: { id: userId } });
            if (!pro) return this.responseData(HttpStatus.NOT_FOUND, true, `Professional was not found.`);

            const payload = {
                professionalId: userId,
                dayOfWeek,
                startTime,
                endTime,
                isActive,
                validFrom,
                validUntil
            };

            // Use upsert for single record too
            const result = await this.repo.upsert(payload, ["professionalId", "dayOfWeek"]);
            
            return this.responseData(HttpStatus.OK, false, `Professional schedule was updated successfully.`, result.identifiers[0]);

        } catch (error) {
            console.error("Single Schedule Error:", error);
            return this.handleTypeormError(error);
        }
    }

    public async schedule(
        userId: string,
        id: string
    ) {
        try {
            const professionalRepo = AppDataSource.getRepository(ProfessionalEntity);

            let user = await professionalRepo.findOne({ where: { id: userId } });
            if (!user) return this.responseData(HttpStatus.NOT_FOUND, true, `Professional was not found.`);

            const scheduleRepo = AppDataSource.getRepository(ProfessionalSchedule);
            const schedule = await scheduleRepo.findOne({ where: { id, professionalId: userId } });
            if (!schedule) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Schedule not found.");
            }

            return this.responseData(HttpStatus.OK, false, `Schedule was retrieved successfully.`, schedule);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async schedules(professionalId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const [records, total] = await this.repo.findAndCount({
                where: { professionalId: professionalId },
                skip,
                take: limit,
                // order: { createdAt: "DESC" },
            });

            const data = {
                records: records,
                pagination: this.pagination(page, limit, total),
            }

            return this.responseData(200, false, "Schedules have been retrieved successfully", data)
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }


    public async update(
        userId: string,
        id: string,
        dayOfWeek: DayOfWeek | null,
        startTime: string | null,
        endTime: string | null,
        isActive: boolean | null,
        validFrom: string | null,
        validUntil: string | null
    ) {
        try {
            const professionalRepo = AppDataSource.getRepository(ProfessionalEntity);

            let user = await professionalRepo.findOne({ where: { id: userId } });
            if (!user) return this.responseData(HttpStatus.NOT_FOUND, true, `Professional was not found.`);

            const scheduleRepo = AppDataSource.getRepository(ProfessionalSchedule);
            const existing = await scheduleRepo.findOne({ where: { id, professionalId: userId } });
            if (!existing) {
                return this.responseData(HttpStatus.NOT_FOUND, true, "Schedule not found.");
            }

            await scheduleRepo.update({ id, professionalId: userId }, {
                dayOfWeek: dayOfWeek ?? existing.dayOfWeek,
                startTime: startTime ?? existing.startTime,
                endTime: endTime ?? existing.endTime,
                isActive: isActive ?? existing.isActive,
                validFrom: validFrom ?? existing.validFrom,
                validUntil: validUntil ?? existing.validUntil,
            } as DeepPartial<ProfessionalSchedule>);

            return this.responseData(HttpStatus.OK, false, `Schedule was updated successfully.`);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async delete(
        userId: string,
        id: string
    ) {
        try {
            const professionalRepo = AppDataSource.getRepository(ProfessionalEntity);

            let user = await professionalRepo.findOne({ where: { id: userId } });
            if (!user) return this.responseData(HttpStatus.NOT_FOUND, true, `Professional was not found.`);

            const scheduleRepo = AppDataSource.getRepository(ProfessionalSchedule);
            await scheduleRepo.delete({ professionalId: userId, id })
            return this.responseData(HttpStatus.OK, false, `Schedule was deleted successfully.`);

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }
}