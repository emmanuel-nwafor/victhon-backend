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

adminRouter.get("/users", controller.getUsers);
adminRouter.get("/professionals", controller.getProfessionals);
adminRouter.patch("/professionals/:id/verify", controller.verifyProfessional);
adminRouter.get("/stats", controller.getStats);
adminRouter.get("/transactions", controller.getTransactions);

export default adminRouter;
