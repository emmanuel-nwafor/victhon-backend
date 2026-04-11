import { Router } from "express";
import AdminController from "../controllers/Admin";
import verifyJWT from "../middlewares/verifyJWT";
import { UserType } from "../types/constants";

const adminRouter = Router();
const controller = new AdminController();

// Public route for admin login
adminRouter.post("/login", controller.login);

// Protected admin routes
adminRouter.use(verifyJWT([UserType.Admin]));

adminRouter.post("/", controller.createAdmin);
adminRouter.get("/users", controller.getUsers);
adminRouter.get("/users/:id", controller.getUserDetails);
adminRouter.patch("/users/:id/status", controller.toggleUserStatus);

adminRouter.get("/professionals", controller.getProfessionals);
adminRouter.get("/professionals/pending", controller.getPendingProfessionals);
adminRouter.get("/professionals/:id", controller.getProfessionalDetails);
adminRouter.patch("/professionals/:id/status", controller.toggleProfessionalStatus);
adminRouter.patch("/professionals/:id/verify", controller.verifyProfessional);

adminRouter.get("/bookings", controller.getBookings);
adminRouter.get("/bookings/:id", controller.getBookingDetails);

adminRouter.get("/stats", controller.getStats);
adminRouter.get("/transactions", controller.getTransactions);
adminRouter.get("/transactions/:id", controller.getTransactionDetails);

adminRouter.delete("/users/:id", controller.deleteUser);

adminRouter.get("/settings", controller.getPlatformSettings);
adminRouter.patch("/settings", controller.updatePlatformSettings);

adminRouter.get("/disputes", controller.getDisputes);
adminRouter.get("/disputes/:id", controller.getDisputeDetails);
adminRouter.patch("/disputes/:id/resolve", controller.resolveDispute);

adminRouter.post("/broadcast", controller.broadcast);
adminRouter.get("/communication/stats", controller.getCommunicationStats);
adminRouter.get("/communication/logs", controller.getBroadcastLogs);

export default adminRouter;
