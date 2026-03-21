import {Router, Request, Response} from 'express';
import asyncHandler from "express-async-handler";
import Controller from "../controllers/Wallet";

const wallet = Router();

// wallet.post("/", create, asyncHandler(Controller.create));
wallet.get("/", asyncHandler(Controller.wallet));
wallet.get("/history", asyncHandler(Controller.history));
wallet.get("/:transactionId", asyncHandler(Controller.transaction));


export default wallet;