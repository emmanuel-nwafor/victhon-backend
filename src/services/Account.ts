import axios from "axios";
import env, { EnvKey } from "../config/env";
import { AppDataSource } from "../data-source";
import { Account as AccountEntity } from "../entities/Account";
import { Professional } from "../entities/Professional";
import Service from "./Service";

// ─────────────────────────────────────────────────────────────────────────────
// Flutterwave v3 API base URL
// ─────────────────────────────────────────────────────────────────────────────
const FLW_BASE_URL = "https://api.flutterwave.com/v3";

export default class Account extends Service {
  private readonly repo = AppDataSource.getRepository(AccountEntity);
  private readonly FLW_SECRET_KEY = env(EnvKey.FLW_SECRET_KEY)!;

  // Shared axios instance
  private get flwClient() {
    return axios.create({
      baseURL: FLW_BASE_URL,
      headers: {
        Authorization: `Bearer ${this.FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  public async createAccount(
    professionalId: string,
    name: string,
    accountNumber: string,
    bankName: string,
    bankCode: string,
  ) {
    try {
      const professionalRepo = AppDataSource.getRepository(Professional);
      const professional = await professionalRepo.findOneBy({
        id: professionalId,
      });

      if (!professional)
        return this.responseData(404, true, "User was not found");

      const account = this.repo.create({
        professional,
        name,
        bankName,
        accountNumber,
        bankCode,
      });

      const savedAccount: any = await this.repo.save(account);
      return this.responseData(
        201,
        false,
        "Account was added successfully",
        savedAccount,
      );
    } catch (error) {
      console.log(error);
      return this.handleTypeormError(error);
    }
  }

  public async getAccounts(
    professionalId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    try {
      page = Math.max(1, page);
      limit = Math.min(50, Math.max(1, limit));
      const skip = (page - 1) * limit;

      const [accounts, total] = await this.repo.findAndCount({
        where: { professional: { id: professionalId } },
        order: { createdAt: "DESC" },
        skip,
        take: limit,
      });

      return this.responseData(200, false, "Accounts retrieved successfully", {
        records: accounts,
        pagination: this.pagination(page, limit, total),
      });
    } catch (error) {
      return this.handleTypeormError(error);
    }
  }

  public async getAccount(accountId: string, professionalId: string) {
    try {
      const account = await this.repo.findOne({
        where: { id: accountId, professional: { id: professionalId } },
        relations: ["professional"],
      });

      if (!account) return this.responseData(404, true, "Account not found");
      return this.responseData(
        200,
        false,
        "Account retrieved successfully",
        account,
      );
    } catch (error) {
      return this.handleTypeormError(error);
    }
  }

  public async deleteAccount(accountId: string, professionalId: string) {
    try {
      const account = await this.repo.findOne({
        where: { id: accountId, professional: { id: professionalId } },
      });

      if (!account) return this.responseData(404, true, "Account not found");

      await this.repo.remove(account);
      return this.responseData(200, false, "Account deleted successfully");
    } catch (error) {
      return this.handleTypeormError(error);
    }
  }

  public async updateAccount(
    accountId: string,
    professionalId: string,
    payload: Partial<{
      name: string;
      accountNumber: string;
      bankName: string;
      bankCode: string;
    }>,
  ) {
    try {
      const account = await this.repo.findOne({
        where: { id: accountId, professional: { id: professionalId } },
      });

      if (!account) return this.responseData(404, true, "Account not found");

      // Re-verify if bank details are changing
      if (payload.accountNumber && payload.bankCode) {
        await this.flwClient.post("/accounts/resolve", {
          account_number: payload.accountNumber,
          account_bank: payload.bankCode,
        });
      }

      Object.assign(account, payload);
      const updated = await this.repo.save(account);
      return this.responseData(
        200,
        false,
        "Account updated successfully",
        updated,
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return this.responseData(
          400,
          true,
          error.response?.data?.message ?? "Invalid bank details",
        );
      }
      return this.handleTypeormError(error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FETCH BANK LIST
  //
  // Paystack: GET https://api.paystack.co/bank?currency=NGN
  // Flutterwave: GET /v3/banks/NG
  //
  // Returns a list of Nigerian banks with their codes
  // ─────────────────────────────────────────────────────────────
  public async banks() {
    try {
      const res = await this.flwClient.get("/banks/NG");
      console.log(res.data);
      return this.responseData(
        200,
        false,
        "Banks were retrieved successfully",
        res.data?.data ?? res.data,
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED")
          return this.responseData(500, true, "Flutterwave request timed out");
        return this.responseData(500, true, "Failed to fetch banks");
      }
      return this.responseData(500, true, "Something went wrong");
    }
  }
}
