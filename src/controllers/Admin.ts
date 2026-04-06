import { Request, Response } from "express";
import AdminService from "../services/Admin";
import Authentication from "../services/Authentication";
import Controller from "./Controller";

export default class AdminController extends Controller {
    private adminService: AdminService = new AdminService();
    private authService: Authentication = new Authentication();

    public login = async (req: Request, res: Response) => {
        const { email, password } = req.body;
        const result = await this.authService.adminLogin(email, password);
        return res.status(result.statusCode).json(result);
    };

    public getUsers = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getUsers(page, limit);
        return res.status(result.statusCode).json(result);
    };

    public getProfessionals = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getProfessionals(page, limit);
        return res.status(result.statusCode).json(result);
    };

    public verifyProfessional = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const { isVerified } = req.body;
        const result = await this.adminService.verifyProfessional(id, isVerified);
        return res.status(result.statusCode).json(result);
    };

    public getStats = async (req: Request, res: Response) => {
        const result = await this.adminService.getStats();
        return res.status(result.statusCode).json(result);
    };

    public getTransactions = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getTransactions(page, limit);
        return res.status(result.statusCode).json(result);
    };
}
