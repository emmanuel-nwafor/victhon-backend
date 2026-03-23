import { Request, Response } from "express";
import Service from "../services/Authentication";
import { UserType } from "../types/constants";


export default class Authentication {

    private static service = new Service();

    public static async signUp(req: Request, res: Response) {
        const { email, password } = req.body;

        const serviceResult = await Authentication.service.signUp(email, password);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async login(req: Request, res: Response) {
        const { email, password } = req.body;
        const serviceResult = await Authentication.service.login(email, password);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async professionalSignUp(req: Request, res: Response) {
        const { email, password } = req.body;
        const serviceResult = await Authentication.service.professionalSignUp(email, password);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    // public static async professionalSignUp(req: Request, res: Response) {
    //     let signUpData = req.body;
    //     // const files = req.files;
    //     signUpData.files = req.files;

    //     const serviceResult = await Authentication.service.professionalSignUp(signUpData);
    //     res.status(serviceResult.statusCode).json(serviceResult.json);
    //     // res.status(200).json({files});

    // }

    public static async professionalLogin(req: Request, res: Response) {
        const { email, password } = req.body;
        const serviceResult = await Authentication.service.professionalLogin(email, password);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async verifyUserOTP(req: Request, res: Response) {
        const { email, otp } = req.body;
        const serviceResult = await Authentication.service.verifyOTP(email, otp, UserType.USER);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async verifyProfessionalOTP(req: Request, res: Response) {
        const { email, otp } = req.body;
        const serviceResult = await Authentication.service.verifyOTP(email, otp, UserType.PROFESSIONAL);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async resendUserOTP(req: Request, res: Response) {
        const { email } = req.body;
        const serviceResult = await Authentication.service.resendOTP(email, UserType.USER);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async resendProfessionalOTP(req: Request, res: Response) {
        const { email } = req.body;
        const serviceResult = await Authentication.service.resendOTP(email, UserType.PROFESSIONAL);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async forgotUserPassword(req: Request, res: Response) {
        const { email } = req.body;
        const serviceResult = await Authentication.service.forgotPassword(email, UserType.USER);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async forgotProfessionalPassword(req: Request, res: Response) {
        const { email } = req.body;
        const serviceResult = await Authentication.service.forgotPassword(email, UserType.PROFESSIONAL);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async verifyUserPasswordResetOTP(req: Request, res: Response) {
        const { email, otp } = req.body;
        const serviceResult = await Authentication.service.verifyPasswordResetOTP(email, otp, UserType.USER);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async verifyProfessionalPasswordResetOTP(req: Request, res: Response) {
        const { email, otp } = req.body;
        const serviceResult = await Authentication.service.verifyPasswordResetOTP(email, otp, UserType.PROFESSIONAL);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async resetUserPassword(req: Request, res: Response) {
        const { email, newPassword } = req.body;
        const serviceResult = await Authentication.service.resetPassword(email, newPassword, UserType.USER);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async resetProfessionalPassword(req: Request, res: Response) {
        const { email, newPassword } = req.body;
        const serviceResult = await Authentication.service.resetPassword(email, newPassword, UserType.PROFESSIONAL);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async userGoogleAuth(req: Request, res: Response) {
        const { idToken } = req.body;
        const serviceResult = await Authentication.service.googleAuth(idToken, UserType.USER);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }

    public static async professionalGoogleAuth(req: Request, res: Response) {
        const { idToken } = req.body;
        const serviceResult = await Authentication.service.googleAuth(idToken, UserType.PROFESSIONAL);
        res.status(serviceResult.statusCode).json(serviceResult.json);
    }
}