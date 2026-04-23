import { Request, Response, NextFunction } from 'express';
import Token from '../services/Token';
import {HttpStatus, HttpStatusMessage} from "../types/constants";
import env, {EnvKey} from "../config/env";
import TokenBlackList from '../cache/TokenBlacklist';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { Professional } from '../entities/Professional';
import { Admin } from '../entities/Admin';
import { UserType } from '../types/constants';

const verifyJWT = (types: string[], neededData: string[] = ['data']) => async (req: Request, res: Response, next: NextFunction) => {
    const tokenSecret: string = env(EnvKey.TOKEN_SECRET)!;

    if (!req.headers.authorization || req.headers.authorization.indexOf('Bearer ') === -1) {
        res.status(401).json({ error: true, message: 'Missing Bearer Authorization Header' });
        return;
    }

    const token = req.headers.authorization.split(' ')[1];
    if (!token) {
        res.status(401).json({
            error: true,
            message: "Token missing"
        });
        return;
    }
    const cache = new TokenBlackList();
    const isBlacklistedResult = await cache.get(token);

    if (isBlacklistedResult.error) {
        res.status(500).json({
            error: true,
            message: HttpStatusMessage[HttpStatus.INTERNAL_SERVER_ERROR]
        });
        return;
    }

    if (isBlacklistedResult.data) {
        res.status(401).json({
            error: true,
            message: "Token is invalid"
        });
        return;
    }

    const tokenValidationResult: any = Token.validateToken(token, types, tokenSecret);

    if (tokenValidationResult.error) {
        const statusCode = tokenValidationResult.message == HttpStatusMessage[HttpStatus.UNAUTHORIZED] ? 401 : 400;
        res.status(statusCode).json({
            error: true,
            message: tokenValidationResult.message
        });
        return;
    }

    for (let item of neededData) {
        res.locals[item] = tokenValidationResult.data[item];
    }

    res.locals['userType'] = tokenValidationResult.data['types'][0];

    const userData = tokenValidationResult.data.data;
    const userRole = tokenValidationResult.data.types[0];

    // Check suspension status directly
    if (userData && userData.id && userRole) {
        let accountActive = true;
        
        if (userRole === UserType.USER) {
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOne({ select: ["id", "isActive", "currentDeviceId"], where: { id: userData.id } });
            if (user) {
                if (!user.isActive) accountActive = false;
                // Single device login check
                if (userData.deviceId && user.currentDeviceId && userData.deviceId !== user.currentDeviceId) {
                    res.status(401).json({ error: true, message: "Logged in from another device" });
                    return;
                }
            }
        } else if (userRole === UserType.PROFESSIONAL) {
            const proRepo = AppDataSource.getRepository(Professional);
            const pro = await proRepo.findOne({ select: ["id", "isActive", "currentDeviceId"], where: { id: userData.id } });
            if (pro) {
                if (!pro.isActive) accountActive = false;
                // Single device login check
                if (userData.deviceId && pro.currentDeviceId && userData.deviceId !== pro.currentDeviceId) {
                    res.status(401).json({ error: true, message: "Logged in from another device" });
                    return;
                }
            }
        } else if (userRole === UserType.Admin) {
            const adminRepo = AppDataSource.getRepository(Admin);
            const admin = await adminRepo.findOne({ select: ["id", "isActive"], where: { id: userData.id } });
            if (admin && !admin.isActive) accountActive = false;
        }

        if (!accountActive) {
            res.status(403).json({
                error: true,
                message: "Account Suspended: You no longer have access to the system."
            });
            return;
        }
    }

    next();
}

export default verifyJWT;