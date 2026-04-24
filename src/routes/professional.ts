import { Router, Request, Response } from 'express';
import asyncHandler from "express-async-handler";
import Controller from "../controllers/Professional";
import { editProfessionalValidator, setupBusinessProfileValidator, validatePhotoField } from '../middlewares/routes/professional';

const professional = Router();

professional.get("/", asyncHandler(Controller.profile));
professional.patch("/", editProfessionalValidator, asyncHandler(Controller.editProfessionalProfile));
professional.post("/setup-business-profile", setupBusinessProfileValidator, asyncHandler(Controller.setupBusinessProfile));
professional.patch("/push-token", asyncHandler(Controller.savePushToken));
professional.patch("/availability", asyncHandler(Controller.updateAvailability));

// Schedule Management
professional.get("/schedule", asyncHandler(Controller.getSchedule));
professional.post("/schedule", asyncHandler(Controller.createSchedule));
professional.post("/schedule/bulk", asyncHandler(Controller.createSchedules));

export default professional;