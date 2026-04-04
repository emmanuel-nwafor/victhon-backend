import { AppDataSource } from "../data-source";
import Service from "./Service";
import { Review as Entity } from "../entities/Review";
import { Professional } from "../entities/Professional";
import { RatingAggregate } from "../entities/RatingAggregate";
import { HttpStatus, UserType } from "../types/constants";
import notify from "./notify";
import { NotificationType } from "../entities/Notification";


export default class Review extends Service {

    private readonly repo = AppDataSource.getRepository(Entity);
    private readonly ratingAggRepo = AppDataSource.getRepository(RatingAggregate);

    public async createReview(
        userId: string,
        professionalId: string,
        rating: number,
        text: string
    ) {
        try {
            const data = await AppDataSource.transaction(async (manager) => {
                const existingProfessional = await manager.findOne(Professional, {
                    where: { id: professionalId },
                    relations: ["setting"],
                });

                if (!existingProfessional) {
                    throw new Error('Professional was not found');
                }

                if (existingProfessional.setting && existingProfessional.setting.customerReviewsEnabled === false) {
                    throw new Error("This professional is currently not accepting customer reviews.");
                }

                // 2. Prevent duplicate reviews (VERY IMPORTANT)
                const existingReview = await manager.findOne(Entity, {
                    where: { userId, professionalId },
                });

                if (existingReview) {
                    throw new Error("You have already reviewed this professional");
                }

                const review = manager.create(Entity, {
                    userId,
                    professionalId,
                    text,
                    rating
                });

                let agg = await manager.createQueryBuilder(RatingAggregate, "agg")
                    .setLock("pessimistic_write")
                    .where("agg.professionalId = :professionalId", { professionalId })
                    .getOne();

                if (!agg) {
                    // First review
                    agg = manager.create(RatingAggregate, {
                        professionalId,
                        total: 1,
                        ratingSum: rating,
                        average: rating,
                        ratingDistribution: {
                            1: rating === 1 ? 1 : 0,
                            2: rating === 2 ? 1 : 0,
                            3: rating === 3 ? 1 : 0,
                            4: rating === 4 ? 1 : 0,
                            5: rating === 5 ? 1 : 0,
                        },
                    });
                } else {
                    agg.total += 1;
                    agg.ratingSum += rating;
                    agg.average = Number((agg.ratingSum / agg.total).toFixed(2));

                    const dist = agg.ratingDistribution as Record<number, number>;
                    dist[rating] = (dist[rating] || 0) + 1;
                    agg.ratingDistribution = dist as any;
                }


                // 6. Persist changes
                await manager.save(agg);
                const savedReview = await manager.save(review);

                return {
                    review: savedReview,
                    aggregate: agg,
                };
            });

            if (data) {
                notify({
                    userId: professionalId,
                    userType: UserType.PROFESSIONAL,
                    type: NotificationType.NEW_REVIEW,
                    data: data
                }).catch(err => console.error("[REVIEW_FLOW] Failed to queue review notification:", err));
            }

            return this.responseData(201, false, "Review was created successfully", data);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async review(professionalId: string, id: string) {
        try {

            const review = await this.repo.findOne({ where: { id, professionalId } });

            if (!review) return this.responseData(404, true, "Review not found");

            return this.responseData(200, false, "Review has been retrieved successfully", review);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async reviews(professionalId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const [[reviews, total], details] = await Promise.all([
                this.repo.findAndCount({
                    where: { professionalId: professionalId },
                    skip,
                    take: limit,
                    order: { createdAt: "DESC" },
                    relations: ["user"],
                }),
                this.ratingAggRepo.findOne({ where: { professionalId: professionalId } })
            ]);

            const data = {
                records: reviews,
                pagination: this.pagination(page, limit, total),
                details
            }


            return this.responseData(200, false, "Reviews have been retrieved successfully", data)
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async updateReview(
        userId: string,
        reviewId: string,
        payload: {
            rating?: number;
            text?: string;
        }
    ) {
        try {
            const result = await AppDataSource.transaction(async (manager) => {

                // 1. Fetch review (ownership enforced)
                const review = await manager.findOne(Entity, {
                    where: { id: reviewId, userId },
                });

                if (!review) {
                    throw new Error("Review not found or not owned by user");
                }

                // 2. Lock rating aggregate
                const agg = await manager
                    .createQueryBuilder(RatingAggregate, "agg")
                    .setLock("pessimistic_write")
                    .where("agg.professionalId = :professionalId", {
                        professionalId: review.professionalId,
                    })
                    .getOne();

                if (!agg) {
                    throw new Error("Rating aggregate not found");
                }

                // 3. Handle rating change
                if (
                    payload.rating !== undefined &&
                    payload.rating !== review.rating
                ) {
                    const oldRating = review.rating;
                    const newRating = payload.rating;

                    // update sums
                    agg.ratingSum = agg.ratingSum - oldRating + newRating;
                    agg.average = Number(
                        (agg.ratingSum / agg.total).toFixed(2)
                    );

                    // update distribution
                    const dist = agg.ratingDistribution as Record<number, number>;
                    dist[oldRating] = Math.max((dist[oldRating] || 1) - 1, 0);
                    dist[newRating] = (dist[newRating] || 0) + 1;
                    agg.ratingDistribution = dist as any;

                    review.rating = newRating;
                }

                // 4. Update text (if provided)
                if (payload.text !== undefined) {
                    review.text = payload.text;
                }

                // 5. Persist changes
                await manager.save(agg);
                const updatedReview = await manager.save(review);

                return updatedReview;
            });

            return this.responseData(
                HttpStatus.OK,
                false,
                "Review was updated successfully",
                result
            );

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }


    public async delete(
        userId: string,
        id: string
    ) {
        try {
            const result = await AppDataSource.transaction(async (manager) => {

                // 1. Fetch review + ownership
                const review = await manager.findOne(Entity, {
                    where: { id, userId },
                });

                if (!review) {
                    throw new Error("Review not found or not owned by user");
                }

                // 2. Lock aggregate
                const agg = await manager
                    .createQueryBuilder(RatingAggregate, "agg")
                    .setLock("pessimistic_write")
                    .where("agg.professionalId = :professionalId", {
                        professionalId: review.professionalId,
                    })
                    .getOne();

                if (!agg) {
                    throw new Error("Rating aggregate not found");
                }

                // 3. Update aggregate safely
                agg.total -= 1;
                agg.ratingSum -= review.rating;

                const dist = agg.ratingDistribution as Record<number, number>;
                dist[review.rating] = Math.max((dist[review.rating] || 1) - 1, 0);
                agg.ratingDistribution = dist as any;

                agg.average =
                    agg.total > 0
                        ? Number((agg.ratingSum / agg.total).toFixed(2))
                        : 0;

                // 4. Persist changes
                await manager.save(agg);
                await manager.remove(review);

                return true;
            });

            return this.responseData(
                HttpStatus.OK,
                false,
                "Review was deleted successfully"
            );

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

}