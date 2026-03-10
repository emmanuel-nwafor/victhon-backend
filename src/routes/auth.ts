import { NextFunction, Request, Response, Router } from 'express';
import asyncHandler from "express-async-handler";
import passport from '../config/passport';
import Authentication from "../controllers/Authentication";
import { login, professionalSignUp, resendOTP, userSignUp, verifyOTP } from "../middlewares/routes/auth";

const auth = Router();

auth.post("/users/sign-up", userSignUp, asyncHandler(Authentication.signUp));
auth.post("/users/login", login, asyncHandler(Authentication.login));
auth.post("/users/verify-otp", verifyOTP, asyncHandler(Authentication.verifyUserOTP));
auth.post("/users/resend-otp", resendOTP, asyncHandler(Authentication.resendUserOTP));

auth.post("/professionals/sign-up", professionalSignUp, asyncHandler(Authentication.professionalSignUp));
auth.post("/professionals/login", login, asyncHandler(Authentication.professionalLogin));
auth.post("/professionals/verify-otp", verifyOTP, asyncHandler(Authentication.verifyProfessionalOTP));
auth.post("/professionals/resend-otp", resendOTP, asyncHandler(Authentication.resendProfessionalOTP));

auth.get('/google', (req: Request, res: Response, next: NextFunction) => {
    const type = req.query.type || "user"; // default type

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: JSON.stringify({ type }),
    })(req, res, next);
});

// auth.get('/google/callback', passport.authenticate('google'), asyncHandler(Authentication.googleAuth),
//     (err: any, req: any, res: any, next: any) => {
//         console.log(typeof err);

//         console.error('OAuth Error:', err.oauthError || err);
//         res.status(500).send('Authentication failed');
//         return;
//     }
// );

export default auth;