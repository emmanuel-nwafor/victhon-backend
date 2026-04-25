import { Server } from "socket.io";
import { Namespaces } from "../types/constants";
import logger from "../config/logger";

export default class AdminNotify {
    private static io: Server | null = null;

    public static initialize(io: Server) {
        this.io = io;
    }

    public static broadcast(event: string, data: any) {
        if (!this.io) {
            logger.warn("AdminNotify skipped: Socket.io not initialized");
            return;
        }

        try {
            const adminNamespace = this.io.of(Namespaces.ADMIN);
            adminNamespace.emit(event, data);
            // logger.info(`📢 Broadcasted [${event}] to Admin namespace`);
        } catch (error) {
            logger.error(`AdminNotify error [${event}]:`, error);
        }
    }
}
