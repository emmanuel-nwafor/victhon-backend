import Service from "./Service";
import {Wallet as Entity} from "./../entities/Wallet";
import {AppDataSource} from "../data-source";
import {Transaction} from "../entities/Transaction";
import {Professional} from "../entities/Professional";


export default class Wallet extends Service {

    private readonly repo = AppDataSource.getRepository(Entity);
    private readonly transactionRepo = AppDataSource.getRepository(Transaction);
    private readonly professionalRepo = AppDataSource.getRepository(Professional);


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
            const professional = await this.professionalRepo.findOne({where: {id: professionalId},relations: ['wallet']});
            if (!professional) return this.responseData(404, false, "Professional was not found");
            const wallet = professional.wallet;
            if(!wallet) return this.responseData(404, false, "Wallet was not found");
            const result = await this.transactionRepo.findOne({where: {walletId: wallet.id,id: transactionId}});
            if (!result) return this.responseData(404, false, "Transaction was not found");
            return this.responseData(200, false, "Transaction was retrieved successfully", result);
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