import Service from "./Service";
import {Wallet as Entity} from "./../entities/Wallet";
import {AppDataSource} from "../data-source";
import {Transaction, TransactionType} from "../entities/Transaction";
import {Professional} from "../entities/Professional";
import {Account} from "../entities/Account";


export default class Wallet extends Service {

    private readonly repo = AppDataSource.getRepository(Entity);
    private readonly transactionRepo = AppDataSource.getRepository(Transaction);
    private readonly professionalRepo = AppDataSource.getRepository(Professional);
    private readonly accountRepo = AppDataSource.getRepository(Account);


    public async wallet(userId: string) {
        try {
            let result = await this.repo.findOne({where: {professionalId: userId}});
            
            if (!result) {
                // Auto-create wallet if it doesn't exist
                result = this.repo.create({
                    professionalId: userId,
                    balance: 0,
                    pendingAmount: 0,
                    totalBalance: 0
                });
                await this.repo.save(result);
            }

            return this.responseData(200, false, "Wallet was retrieved successfully", result);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async transaction(professionalId: string, transactionId: string) {
        try {
            const professional = await this.professionalRepo.findOne({
                where: {id: professionalId},
                relations: ['wallet']
            });
            if (!professional) return this.responseData(404, false, "Professional was not found");
            
            const walletId = professional.wallet?.id;
            const queryConditions: any[] = [{ id: transactionId, professionalId }];
            if (walletId) {
                queryConditions.push({ id: transactionId, walletId });
            }

            const result = await this.transactionRepo.findOne({
                where: queryConditions,
                relations: ['escrow', 'escrow.booking', 'escrow.booking.user', 'escrow.booking.services']
            });
            if (!result) return this.responseData(404, false, "Transaction was not found");

            // Fetch professional's payout bank account if withdrawal
            const account = await this.accountRepo.findOne({
                where: { professionalId },
                order: { createdAt: "DESC" }
            });

            const booking = result.escrow?.booking;
            const customer = booking?.user;
            const serviceName = booking?.services?.[0]?.name;

            // Normalize and enrich transaction response for provider display
            const enriched: any = {
                ...result,
                bookingId: booking?.id || null,
                serviceName: serviceName || null,
                customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : null,
            };

            if (result.type === TransactionType.WITHDRAWAL) {
                enriched.bank_name = account?.bankName || "Bank Transfer";
                enriched.account_number = account?.accountNumber ? `****** ${account.accountNumber.slice(-4)}` : "Bank Account";
                enriched.account_name = account?.name || `${professional.firstName} ${professional.lastName}`;
                enriched.category = "Bank Withdrawal Payout";
            } else if (result.type === TransactionType.ESCROW_RELEASE || result.type === TransactionType.BOOKING_DEPOSIT) {
                enriched.bank_name = "Victhon Escrow";
                enriched.account_number = "In-App Wallet Credit";
                enriched.account_name = enriched.customerName || `${professional.firstName} ${professional.lastName}`;
                enriched.category = serviceName ? `Service: ${serviceName}` : "Job Completion Earnings";
            } else {
                enriched.bank_name = account?.bankName || "Victhon Wallet";
                enriched.account_number = account?.accountNumber ? `****** ${account.accountNumber.slice(-4)}` : "Wallet Balance";
                enriched.account_name = `${professional.firstName} ${professional.lastName}`;
                enriched.category = "General Transaction";
            }

            return this.responseData(200, false, "Transaction was retrieved successfully", enriched);
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async history(proId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const professional = await AppDataSource.getRepository(Professional).findOne({
                where: {id: proId},
                relations: ['wallet']
            });

            if (!professional) return this.responseData(404, false, "Professional not found");

            if (!professional.wallet) return this.responseData(404, false, "Professional wallet not found");

            const [transactions, total] = await this.transactionRepo.findAndCount({
                where: {walletId: professional.wallet.id},
                skip,
                take: limit,
                order: {createdAt: "DESC"}, // sort newest first
            });

            const data = {
                records: transactions,
                pagination: this.pagination(page, limit, total),
            }

            return this.responseData(200, false, "Transactions have been retrieved successfully", data)
        } catch (error) {
            return this.handleTypeormError(error);
        }

    }
}