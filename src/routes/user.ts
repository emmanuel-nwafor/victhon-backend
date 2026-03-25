import { Router, Request, Response } from 'express';
import asyncHandler from "express-async-handler";
import Controller from "../controllers/User";
import {editUserValidator, validatePhotoField} from '../middlewares/routes/user';

const user = Router();

user.get("/", asyncHandler(Controller.profile));
user.patch("/profile-photo", validatePhotoField, asyncHandler(Controller.uploadProfilePicture));
user.patch("/", editUserValidator, asyncHandler(Controller.editUserProfile));
user.patch("/push-token", asyncHandler(Controller.savePushToken));

export default user;