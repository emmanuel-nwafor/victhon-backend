import { Server } from "socket.io";
import { ISocket } from "../../types";
import logger from "../../config/logger";
import { Namespaces, QueueEvents, QueueNames, UserType } from "../../types/constants";
import Handler from "./Handler";
import User from "../../services/User";
import Professional from "../../services/Professional";
import { AppDataSource } from "../../data-source";
import ChatParticipant from "../../entities/ChatParticipant";
import Message, { MessageStatus } from "../../entities/MessageEntity";
import { RabbitMQ } from "../../services/RabbitMQ";
import OfflineNotification from "../../services/OfflineNotification";
import Inbox from "../../services/Inbox";
import { Not } from "typeorm";
import ChatEntity from "../../entities/ChatEntity";


interface SendMessagePayload {
    receiverId: string;
    content: string;
    chatId: string;
}


export default class SocketHandler {

    private static readonly userService = new User();
    private static readonly proService = new Professional();
    private static readonly chatParticipantsRepo = AppDataSource.getRepository(ChatParticipant);
    private static readonly chatRepo = AppDataSource.getRepository(ChatEntity);
    private static readonly messageRepo = AppDataSource.getRepository(Message);


    public static async onConnection(io: Server, socket: ISocket) {
        try {
            const socketId = socket.id;
            const userId = socket.locals.data.id;
            const userType = socket.locals.data.userType;

            const wasSet = userType == UserType.PROFESSIONAL ? await SocketHandler.proService.setSocketId(userId, socketId) : await SocketHandler.userService.setSocketId(userId, socketId);
            if (!wasSet) socket.emit("appError", Handler.responseData(true, "An internal error occurred"));

            const offline = new OfflineNotification();
            offline.deliverOfflineNotifications(userId, userType).catch(err => console.error("Offline delivery error:", err));

            const inbox = new Inbox();
            inbox.deliverInbox(userId, userType).catch(err => console.error("Inbox delivery error:", err));

            logger.info(`🤝 ${userType}:${userId} with the socket id - ${socketId} has connected.`);
        } catch (error) {
            console.error("Failed to connect: ", error);
        }
    }

    public static async enterChat(io: Server, socket: ISocket, data: any) {
        const socketId = socket.id;
        const userId = socket.locals.data.id;
        const userType = socket.locals.data.userType;
        const { chatId } = data;

        if (!chatId) {
            return socket.emit(
                "appError",
                Handler.responseData(true, "Invalid payload")
            );
        }

        const userService = userType == UserType.PROFESSIONAL ? SocketHandler.proService : SocketHandler.userService;

        const added = await userService.userChats.add(userId, chatId);
        if (!added) {
            logger.info(`${userType}${userId} failed to enter chat:${chatId}`);

            return socket.emit(
                "appError",
                Handler.responseData(true, "Something went wrong")
            );
        } else {
            socket.emit("entered-chat", Handler.responseData(false, "Entered chat", { chatId }));
            logger.info(`${userType}${userId} entered chat:${chatId}`);
        }
    }

    public static async leaveChat(io: Server, socket: ISocket, data: any) {
        const socketId = socket.id;
        const userId = socket.locals.data.id;
        const userType = socket.locals.data.userType;
        const { chatId } = data;

        if (!chatId) {
            return socket.emit(
                "appError",
                Handler.responseData(true, "Invalid payload")
            );
        }

        const userService = userType == UserType.PROFESSIONAL ? SocketHandler.proService : SocketHandler.userService;

        const removed = await userService.userChats.remove(userId, chatId);
        if (!removed) {
            logger.info(`${userType}${userId} failed to leave chat:${chatId}`);

            return socket.emit(
                "appError",
                Handler.responseData(true, "Something went wrong")
            );
        } else {
            socket.emit("left-chat", Handler.responseData(false, "Left chat", { chatId }));
            logger.info(`${userType}${userId} left chat:${chatId}`);
        }
    }


    public static async sendMessage(io: Server, socket: ISocket, data: SendMessagePayload) {
        const senderId = socket.locals.data.id;
        const senderType = socket.locals.data.userType;

        logger.info(`📨 ${senderType}:${senderId} sending a message.`);

        if (!data?.receiverId || !data?.chatId || !data?.content?.trim()) {
            return socket.emit(
                "appError",
                Handler.responseData(true, "Invalid message payload")
            );
        }

        const { receiverId, content, chatId } = data;

        try {
            let where = {}

            const receiverType = senderType == UserType.PROFESSIONAL ? UserType.USER : UserType.PROFESSIONAL;

            if (receiverType == UserType.PROFESSIONAL) where = { professional: { id: receiverId }, chat: { id: chatId } };
            if (receiverType == UserType.USER) where = { chat: { id: chatId }, user: { id: receiverId } };

            const chatParticipant = await SocketHandler.chatParticipantsRepo.findOne({ where, relations: ["chat"], });

            if (!chatParticipant) {
                socket.emit("appError", Handler.responseData(true, "Chat does not exist,create a chat first"));
                return;
            }

            const newMessage = SocketHandler.messageRepo.create({
                chat: chatParticipant.chat,
                senderId,
                senderType,
                receiverType,
                receiverId,
                content
            });

            const created = await SocketHandler.messageRepo.save(newMessage);

            socket.emit("message-sent", newMessage);
            logger.info(`📩 ${senderType}:${senderId} sent a message to ${receiverType}:${receiverId} successfully.`);

            if (created) {
                await SocketHandler.chatRepo.update(chatId, {
                    lastMessageId: created.id,
                    updatedAt: new Date()
                });
                await RabbitMQ.publishToExchange(QueueNames.CHAT, QueueEvents.CHAT_RECEIVE_MESSAGE, {
                    eventType: QueueEvents.CHAT_RECEIVE_MESSAGE,
                    payload: { newMessage, receiverId, receiverType, senderId },
                });
            }
        } catch (error) {
            console.error("sendMessage error:", error);

            socket.emit(
                "appError",
                Handler.responseData(true, "Failed to send message")
            );
        }
    }

    public static async typing(io: Server, socket: ISocket, data: any) {
        const userId = socket.locals.data.id;
        const userType = socket.locals.data.userType;

        const { chatId } = data;

        try {
            if (!chatId) {
                socket.emit("appError", Handler.responseData(true, "Invalid payload"));
                return;
            }

            const chat = await SocketHandler.chatRepo.findOne({
                where: {
                    id: chatId,
                },
                relations: {
                    participants: {
                        user: true,
                        professional: true
                    }
                }
            });

            if (!chat) {
                socket.emit("appError", Handler.responseData(true, "Chat not found."));
                return;
            }

            const authorized = chat.participants.some((participant) => {
                if (userType === UserType.USER) {
                    return participant.userId === userId;
                }

                if (userType === UserType.PROFESSIONAL) {
                    return participant.professionalId === userId;
                }

                return false;
            });

            if (!authorized) {
                socket.emit("appError", Handler.responseData(true, "User is not authorized for this chat"));
                return;
            }

            const receiver = chat.participants.find(p => {
                if (userType === UserType.USER) {
                    return p.professionalId;
                }
                return p.userId;
            });

            if (!receiver) {
                socket.emit("appError", Handler.responseData(true, "Receiver not found"));
                return;
            }

            const receiverId = receiver.userId ?? receiver.professionalId;
            const receiverType = userType == UserType.PROFESSIONAL ? UserType.USER : UserType.PROFESSIONAL

            const socketNamespace = io.of(Namespaces.BASE);

            const socketId = receiverType === UserType.PROFESSIONAL
                ? await SocketHandler.proService.getSocketId(receiverId!)
                : await SocketHandler.userService.getSocketId(receiverId!);

            logger.info(`${userType}:${userId} is typing in chat:${chatId}`);

            if (socketId) {
                socketNamespace.to(socketId).emit("typing", { chatId });
            }
        } catch (error) {
            console.error("typing error:", error);

            socket.emit(
                "appError",
                Handler.responseData(true, "Failed to emit typing event")
            );
        }
    }

    public static async markAsRead(io: Server, socket: ISocket, data: any) {
        const userId = socket.locals.data.id;
        const userType = socket.locals.data.userType;

        const { chatId } = data;

        try {
            if (!chatId) {
                socket.emit("appError", Handler.responseData(true, "Invalid payload"));
                return;
            }

            const chat = await SocketHandler.chatRepo.findOne({
                where: {
                    id: chatId,
                },
                relations: ['participants']
            });

            if (!chat) {
                logger.info(`👎 chat${chatId} does not exist`);
                socket.emit("appError", Handler.responseData(true, "Chat not found"));
                return;
            }

            const authorized = chat.participants.some((participant) => {
                if (userType === UserType.USER) {
                    return participant.userId === userId;
                }

                if (userType === UserType.PROFESSIONAL) {
                    return participant.professionalId === userId;
                }

                return false;
            });

            if (!authorized) {
                logger.info(`👎 ${userType}${userId} User is not authorized for chat:${chatId}`);
                socket.emit("appError", Handler.responseData(true, "User is not authorized for this chat"));
                return;
            }


            const updated = await SocketHandler.messageRepo.update({
                chat: { id: chatId },
                status: MessageStatus.DELIVERED,
                receiverId: userId,
                receiverType: userType
            }, {
                status: MessageStatus.READ
            });

            await AppDataSource.getRepository(ChatParticipant).update(
                {
                    chat: { id: chatId }, // assume all messages from same chat
                    ...(userType === UserType.USER
                        ? { userId }
                        : { professionalId: userId }),
                },
                {
                    unreadCount: 0,
                    lastReadAt: new Date(),
                }
            );

            socket.emit("read", Handler.responseData(false, "Messages read", { chat }));


            if (updated.affected && updated.affected > 0) {
                logger.info(`🆙 chat:${chatId} messages where updated`);

                await RabbitMQ.publishToExchange(QueueNames.CHAT, QueueEvents.CHAT_MARK_AS_READ, {
                    eventType: QueueEvents.CHAT_MARK_AS_READ,
                    payload: { chat, userType },
                });
            } else {
                logger.info(`👎 No messages for chat:${chatId} to update`);
            }
        } catch (error) {
            console.error("markAsRead error:", error);

            socket.emit(
                "appError",
                Handler.responseData(true, "Something went wrong")
            );
        }
    }

    public static async markMessagesAsRead(io: Server, socket: ISocket, data: any) {
        const socketId = socket.id;
        const userId = socket.locals.data.id;
        const userType = socket.locals.data.userType;

        const { messageIds } = data;

        try {
            if (!messageIds || !messageIds.length) {
                socket.emit("appError", Handler.responseData(true, "Invalid message payload"));
                return;
            }

            const chunkSize = 100;
            for (let i = 0; i < messageIds.length; i += chunkSize) {
                const chunk = messageIds.slice(i, i + chunkSize);

                await RabbitMQ.publishToExchange(QueueNames.CHAT, QueueEvents.CHAT_MARK_AS_READ, {
                    eventType: QueueEvents.CHAT_MARK_AS_READ,
                    payload: { chunk, userId, userType },
                });
            }

        } catch (error) {
            console.error("markAsRead error:", error);

            socket.emit(
                "appError",
                Handler.responseData(true, "Something went wrong")
            );
        }
    }

    public static async editMessage(io: Server, socket: ISocket, data: any) {
        const socketId = socket.id;
        const userId = socket.locals.data.id;
        const userType = socket.locals.data.userType;

        if (!data?.messageId || !data?.content?.trim()) {
            return socket.emit(
                "appError",
                Handler.responseData(true, "Invalid edit payload")
            );
        }

        const { messageId, content } = data;

        try {
            const message = await SocketHandler.messageRepo.findOne({
                where: {
                    senderId: userId,
                    senderType: userType,
                    id: messageId
                }
            });


            if (!message) {
                return socket.emit(
                    "appError",
                    Handler.responseData(true, "Message not found")
                );
            }

            message.content = content;
            await SocketHandler.messageRepo.save(message);

            socket.emit("message-edited", message);
        } catch (error) {
            console.error("editMessage error:", error);
            socket.emit(
                "appError",
                Handler.responseData(true, "Something went wrong")
            );
        }
    }

    public static async deleteMessages(io: Server, socket: ISocket, data: any) {
        const socketId = socket.id;
        const userId = socket.locals.data.id;
        const userType = socket.locals.data.userType;

        const { messageIds } = data;

        try {
            if (!messageIds || !messageIds.length) {
                socket.emit("appError", Handler.responseData(true, "Invalid deleteMessages payload"));
                return;
            }

            const chunkSize = 100;
            for (let i = 0; i < messageIds.length; i += chunkSize) {
                const chunk = messageIds.slice(i, i + chunkSize);

                await RabbitMQ.publishToExchange(QueueNames.CHAT, QueueEvents.CHAT_DELETE_MESSAGES, {
                    eventType: QueueEvents.CHAT_DELETE_MESSAGES,
                    payload: { chunk, userId, userType },
                });
            }

        } catch (error) {
            console.error("deleteMessages error:", error);

            socket.emit(
                "appError",
                Handler.responseData(true, "Something went wrong")
            );
        }
    }

    public static async disconnect(io: Server, socket: ISocket, data: any) {
        try {
            const userId = socket.locals.data.id;
            const userType = socket.locals.data.userType;
            const wasDeleted = userType == UserType.PROFESSIONAL ? await SocketHandler.proService.deleteSocketId(userId) : await SocketHandler.userService.deleteSocketId(userId);
            if (!wasDeleted) logger.error(`❌ An internal error occurred, failed to remove ${userType}:${userId} from cache`)

            const userService = userType == UserType.PROFESSIONAL ? SocketHandler.proService : SocketHandler.userService;
            const deletedChats = userService.userChats.delete(userId);
            if (!deletedChats) logger.error(`❌  An internal error occurred, failed to remove ${userType}:${userId} chats from cache`);

            logger.info(`👋 ${userType}:${userId} with the socket id - ${socket.id} has disconnected.`);
        } catch (error) {
            console.error("❌ Error in disconnect:", error);
        }
    }

    public static async updateLocation(io: Server, socket: ISocket, data: any) {
        const { bookingId, latitude, longitude } = data;
        if (!bookingId || !latitude || !longitude) {
            return socket.emit("appError", Handler.responseData(true, "Invalid location payload"));
        }

        const socketNamespace = io.of(Namespaces.BASE);
        logger.info(`📍 Location update for booking ${bookingId}: ${latitude}, ${longitude}`);

        // Broadcast to everyone in the booking room
        socketNamespace.to(`booking_${bookingId}`).emit("location-updated", {
            bookingId,
            latitude,
            longitude,
            timestamp: new Date()
        });
    }

    public static async joinBooking(io: Server, socket: ISocket, data: any) {
        const { bookingId } = data;
        if (!bookingId) {
            return socket.emit("appError", Handler.responseData(true, "Booking ID required"));
        }

        const room = `booking_${bookingId}`;
        socket.join(room);
        logger.info(`👤 ${socket.id} joined room ${room}`);
        socket.emit("joined-booking", Handler.responseData(false, "Joined booking room", { bookingId }));
    }
}