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
        Controller.response(res, result);
    };

    public getUsers = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getUsers(page, limit);
        Controller.response(res, result);
    };

    public toggleUserStatus = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const { isActive } = req.body;
        const result = await this.adminService.toggleUserStatus(id, isActive);
        Controller.response(res, result);
    };

    public getProfessionals = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getProfessionals(page, limit);
        Controller.response(res, result);
    };

    public toggleProfessionalStatus = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const { isActive } = req.body;
        const result = await this.adminService.toggleProfessionalStatus(id, isActive);
        Controller.response(res, result);
    };

    public getPendingProfessionals = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getPendingProfessionals(page, limit);
        Controller.response(res, result);
    };

    public verifyProfessional = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const { isVerified } = req.body;
        const result = await this.adminService.verifyProfessional(id, isVerified);
        Controller.response(res, result);
    };

    public getStats = async (req: Request, res: Response) => {
        const result = await this.adminService.getStats();
        Controller.response(res, result);
    };

    public getTransactions = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getTransactions(page, limit);
        Controller.response(res, result);
    };

    public getBookings = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getBookings(page, limit);
        Controller.response(res, result);
    };

    public getBookingDetails = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const result = await this.adminService.getBookingDetails(id);
        Controller.response(res, result);
    };

    public getTransactionDetails = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const result = await this.adminService.getTransactionDetails(id);
        Controller.response(res, result);
    };

    public getUserDetails = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const result = await this.adminService.getUserDetails(id);
        Controller.response(res, result);
    };

    public getProfessionalDetails = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const result = await this.adminService.getProfessionalDetails(id);
        Controller.response(res, result);
    };

    public createAdmin = async (req: Request, res: Response) => {
        const result = await this.adminService.createAdmin(req.body);
        Controller.response(res, result);
    };

    public deleteUser = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const result = await this.adminService.deleteUser(id);
        Controller.response(res, result);
    };

    public getPlatformSettings = async (req: Request, res: Response) => {
        const result = await this.adminService.getPlatformSettings();
        Controller.response(res, result);
    };

    public updatePlatformSettings = async (req: Request, res: Response) => {
        const result = await this.adminService.updatePlatformSettings(req.body);
        Controller.response(res, result);
    };

    public getDisputes = async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const result = await this.adminService.getDisputes(page, limit);
        Controller.response(res, result);
    };

    public resolveDispute = async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const { action } = req.body;
        const result = await this.adminService.resolveDispute(id, action);
        Controller.response(res, result);
    };
}
