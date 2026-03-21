import { AppDataSource } from "../data-source";
import ChatEntity from "../entities/ChatEntity";
import Service from "./Service";
import { Professional } from "../entities/Professional";
import { User } from "../entities/User";
import ChatParticipant from "../entities/ChatParticipant";
import { CdnFolders, QueueEvents, QueueNames, ResourceType, UserType } from "../types/constants";
import Message, { MessageType } from "../entities/MessageEntity";
import deleteFiles from "../utils/deleteFiles";
import Cloudinary from "./Cloudinary";
import { FailedFiles, UploadedFiles } from "../types";
import MessageAttachment from "../entities/MessageAttachment";
import { RabbitMQ } from "./RabbitMQ";


class TransactionError extends Error {

    constructor(message: string) {
        super(message);
    }
}

export default class Chat extends Service {

    private readonly repo = AppDataSource.getRepository(ChatEntity);
    private readonly messageRepo = AppDataSource.getRepository(Message);
    private readonly professionalRepo = AppDataSource.getRepository(Professional);
    private readonly userRepo = AppDataSource.getRepository(User);
    private readonly chatParticipantsRepo = AppDataSource.getRepository(ChatParticipant);
    private readonly messageAttachmentRepo = AppDataSource.getRepository(MessageAttachment);

    private convertToFileObject(files: Express.Multer.File[]) {
        return files.map((file: Express.Multer.File) => {
            return {
                mimetype: file.mimetype,
                filename: file.filename,
                path: file.path,
                size: file.size,
                originalname: file.originalname
            }
        })
    }


    public async sendAttachment(senderId: string, senderType: UserType, chatId: string, content: string | null, files: Express.Multer.File[]) {
        try {

            const chat = await this.repo.findOne({
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

            if (!chat) return this.responseData(404, true, "Chat not found.");

            const authorized = chat.participants.some((participant) => {
                if (senderType === UserType.USER) {
                    return participant.userId === senderId;
                }

                if (senderType === UserType.PROFESSIONAL) {
                    return participant.professionalId === senderId;
                }

                return false;
            });

            if (!authorized) return this.responseData(401, true, "User is not authorized for this chat");

            const receiver = chat.participants.find(p => {
                if (senderType === UserType.USER) {
                    return p.professionalId;
                }
                return p.userId;
            });

            if (!receiver) return this.responseData(404, true, "Receiver not found");

            if (receiver) {
                await this.repo.update(chatId, { updatedAt: new Date() }); // Refresh timestamp
                await RabbitMQ.publishToExchange(QueueNames.CHAT, QueueEvents.CHAT_SEND_ATTACHMENT, {
                    eventType: QueueEvents.CHAT_SEND_ATTACHMENT,
                    payload: {
                        chatId,
                        receiverId: receiver.userId ?? receiver.professionalId,
                        receiverType: senderType == UserType.PROFESSIONAL ? UserType.USER : UserType.PROFESSIONAL,
                        senderId,
                        content,
                        senderType,
                        files: this.convertToFileObject(files)
                    },
                });
            }

            return this.responseData(201, false, "Attachments are been uploaded successfully", receiver);
        } catch (error) {
            if (files) {
                await deleteFiles(files);
            }
            if (error instanceof TransactionError) return this.responseData(400, true, error.message);
            return super.handleTypeormError(error);
        }
    }

    public async sendAttachmenta(senderId: string, senderType: UserType, receiverId: string, receiverType: UserType, content: string | null, files: Express.Multer.File[]) {
        try {
            let where = {}

            if (receiverType == UserType.PROFESSIONAL) where = { professional: { id: receiverId }, user: { id: senderId } };
            if (receiverType == UserType.USER) where = { user: { id: receiverId }, professional: { id: senderId } };

            const chatParticipant = await this.chatParticipantsRepo.findOne({ where, relations: ["chat"] });

            if (!chatParticipant) return this.responseData(400, true, "Chat does not exist,create a chat first");

            let images: {
                url: string,
                publicId: string,
                type: string,
                size: number,
                thumbnail: string | null,
                duration: string | null
            }[] = [];

            if (files) {
                const cloudinary = new Cloudinary();

                let uploadedFiles: UploadedFiles[] = [], publicIds: string[] = [], failedFiles: FailedFiles[] = [];
                ({
                    uploadedFiles,
                    failedFiles,
                    publicIds
                } = await cloudinary.uploadV2(files, ResourceType.IMAGE, CdnFolders.CHAT));
                if (failedFiles?.length > 0) return this.responseData(500, true, "File uploads failed", failedFiles);

                images = uploadedFiles.map((upload) => ({
                    url: upload.url,
                    publicId: upload.publicId,
                    size: Number(upload.size),
                    type: upload.mimeType,
                    thumbnail: upload.thumbnail,
                    duration: upload.duration,
                }));
            }
            const newMessage = this.messageRepo.create({
                chat: chatParticipant.chat,
                senderId,
                senderType,
                receiverType,
                type: MessageType.FILE,
                receiverId,
                content,
                attachments: images,
            });

            const createdMessage = await this.messageRepo.save(newMessage);

            if (createdMessage) {
                await this.repo.update(chatParticipant.chat.id, { lastMessageId: createdMessage.id });
                await RabbitMQ.publishToExchange(QueueNames.CHAT, QueueEvents.CHAT_RECEIVE_ATTACHMENT, {
                    eventType: QueueEvents.CHAT_RECEIVE_ATTACHMENT,
                    payload: { newMessage, receiverId, receiverType, senderId },
                });
            }
            return this.responseData(201, false, "Attachments created successfully", createdMessage);
        } catch (error) {
            if (files) {
                await deleteFiles(files);
            }
            if (error instanceof TransactionError) return this.responseData(400, true, error.message);
            return super.handleTypeormError(error);
        }
    }

    public async createChat(userId: string, professionalId: string) {
        try {
            const data = await AppDataSource.transaction(async (manager) => {
                const professional = await manager.findOne(Professional, { where: { id: professionalId } });
                if (!professional) throw new TransactionError("Professional not found");

                const user = await manager.findOne(User, { where: { id: userId } });
                if (!user) throw new TransactionError("User not found");
                // const chatExists = await manager.findOne(ChatParticipant, {
                //     where: [
                //         {
                //             professionalId: professional.id,
                //         },
                //         {
                //             userId: professional.id,
                //         },
                //     ],
                // });

                const chatExists = await manager
                    .createQueryBuilder(ChatParticipant, "cp")
                    .innerJoin(
                        ChatParticipant,
                        "cp2",
                        "cp.chatId = cp2.chatId"
                    )
                    .where("cp.professionalId = :professionalId", {
                        professionalId: professional.id,
                    })
                    .andWhere("cp2.userId = :userId", {
                        userId: user.id,
                    })
                    .getOne();
                if (chatExists) throw new TransactionError("Chat already exists");

                const newChat = manager.create(ChatEntity, {});
                const chat = await manager.save(newChat);

                const participants = manager.create(ChatParticipant, [
                    {
                        user: { id: user.id },
                        chat: { id: newChat.id }
                    },
                    {
                        professional: { id: professional.id },
                        chat: { id: newChat.id }
                    }
                ]);

                await manager.save(participants);

                return { chat, user, professional };
            });

            return this.responseData(201, false, "Chat has been created successfully.", data);
        } catch (error) {
            if (error instanceof TransactionError) return this.responseData(400, true, error.message);
            return super.handleTypeormError(error);
        }
    }

    public async getChat(userId: string, userType: UserType, chatId: string) {
        try {
            const chat = await this.repo.findOne({
                where: {
                    id: chatId,
                },
                relations: {
                    participants: {
                        user: true,
                        professional: true
                    },
                    lastMessage: {
                        attachments: true
                    }
                }
            });

            if (!chat) return this.responseData(404, true, "Chat not found.");

            const authorized = chat.participants.some((participant) => {
                if (userType === UserType.USER) {
                    return participant.userId === userId;
                }

                if (userType === UserType.PROFESSIONAL) {
                    return participant.professionalId === userId;
                }

                return false;
            });

            if (authorized) return this.responseData(200, false, "Chat has been retrieved successfully.", chat);

            return this.responseData(401, true, "User is not authorized for this chat");
        } catch (error) {
            return super.handleTypeormError(error);
        }
    }

    public async getChats(
        userId: string,
        userType: UserType,
        page: number,
        limit: number
    ) {
        try {
            const skip = (page - 1) * limit;

            const qb = this.repo
                .createQueryBuilder("chat")
                // Join participants and their profiles
                .leftJoinAndSelect("chat.participants", "participants")
                .leftJoinAndSelect("participants.user", "user")
                .leftJoinAndSelect("participants.professional", "professional")

                // filtering: only show chats where the user is a participant
                .innerJoin(
                    "chat.participants",
                    "filterParticipant",
                    userType === UserType.PROFESSIONAL
                        ? "filterParticipant.professionalId = :userId"
                        : "filterParticipant.userId = :userId",
                    { userId }
                )

                // ✅ NEW: Join the actual last message relation
                .leftJoinAndSelect("chat.lastMessage", "lastMessage")
                .leftJoinAndSelect("lastMessage.attachments", "lastMessageAttachments")

                // Keep your ordering logic
                .addSelect(subQuery => {
                    return subQuery
                        .select("MAX(message.createdAt)")
                        .from("messages", "message")
                        .where("message.chatId = chat.id");
                }, "latestMessageAt")
                .orderBy("latestMessageAt", "DESC")
                .skip(skip)
                .take(limit);

            const [records, total] = await qb.getManyAndCount();

            return this.responseData(200, false, "Chats retrieved successfully", {
                records,
                pagination: this.pagination(page, limit, total),
            });

        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    public async getChatss(userId: string, userType: UserType, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const qb = this.repo
                .createQueryBuilder("chat")
                .leftJoin("chat.participants", "participant")
                .leftJoin("chat.messages", "message") // join only for ordering
                .addSelect("MAX(message.createdAt)", "latestMessageAt") // aggregated column
                .where(
                    userType === UserType.PROFESSIONAL
                        ? "participant.professionalId = :userId"
                        : "participant.userId = :userId",
                    { userId }
                )
                .groupBy("chat.id")
                .orderBy("latestMessageAt", "DESC")
                .skip(skip)
                .take(limit);

            const [records, total] = await qb.getManyAndCount();

            const data = {
                records: records,
                pagination: this.pagination(page, limit, total),
            }

            return this.responseData(200, false, "Messages have been retrieved successfully", data)
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }

    // public async getConversationsWithUnread(userId: string, userType: UserType) {
    //     const repo = AppDataSource.getRepository(ChatParticipant);
    //
    //     const  = await repo.findAndCount({
    //         where: userType === UserType.USER
    //             ? { userId }
    //             : { professionalId: userId },
    //         relations: ['chat', 'chat.messages', 'chat.participants'],
    //         order: { chat: { messages:{createdAt: 'DESC'} } }
    //     });
    //
    //     return participants.map(p => ({
    //         chatId: p.chat.id,
    //         unreadCount: p.unreadCount,
    //         lastMessageAt: p.chat.lastMessageAt,
    //         // map other user/professional info
    //         partner: getPartnerFromChat(p.chat, userId, userType),
    //         lastMessage: p.chat.messages[p.chat.messages.length - 1],
    //     }));
    // }

    public async getMessages(userId: string, userType: UserType, chatId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const baseQuery = this.messageRepo
                .createQueryBuilder("message")
                .innerJoin("message.chat", "chat")
                .innerJoin("chat.participants", "participant")
                .where("chat.id = :chatId", { chatId })
                .andWhere(
                    userType === UserType.PROFESSIONAL
                        ? "participant.professionalId = :userId"
                        : "participant.userId = :userId",
                    { userId }
                );

            // Total messages count for pagination
            const total = await baseQuery.getCount();

            // Fetch message IDs for the current page
            const messageIdsResult = await baseQuery
                .select("message.id")
                .orderBy("message.createdAt", "DESC")
                .skip(skip)
                .take(limit)
                .getRawMany<{ message_id: string }>();

            const messageIds = messageIdsResult.map(m => m.message_id);

            if (messageIds.length === 0) {
                return this.responseData(200, false, "Messages have been retrieved successfully", {
                    records: [],
                    pagination: this.pagination(page, limit, total)
                })
            }

            // -----------------------------
            // Phase 2: Fetch messages WITH attachments
            // -----------------------------
            const records = await this.messageRepo
                .createQueryBuilder("message")
                .leftJoinAndSelect("message.attachments", "attachments")
                .where("message.id IN (:...ids)", { ids: messageIds })
                .orderBy("message.createdAt", "DESC")
                .getMany();

            const data = {
                records: records,
                pagination: this.pagination(page, limit, total),
            }

            return this.responseData(200, false, "Messages have been retrieved successfully", data)
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }


    public async getMessagess(userId: string, userType: UserType, chatId: string, page: number, limit: number) {
        try {
            const skip = (page - 1) * limit;

            const [records, total] = await this.messageRepo
                .createQueryBuilder("message")
                .leftJoin("message.chat", "chat")
                .leftJoin("message.attachments", "attachments")
                .leftJoin("chat.participants", "participant")
                .where("chat.id = :chatId", { chatId })
                .andWhere(
                    userType === UserType.PROFESSIONAL
                        ? "participant.professionalId = :userId"
                        : "participant.userId = :userId",
                    { userId }
                )
                .orderBy("message.createdAt", "DESC")
                .skip(skip)
                .take(limit)
                .getManyAndCount();


            const data = {
                records: records,
                pagination: this.pagination(page, limit, total),
            }

            return this.responseData(200, false, "Messages have been retrieved successfully", data)
        } catch (error) {
            return this.handleTypeormError(error);
        }
    }


}