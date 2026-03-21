import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    OneToOne,
    JoinColumn
} from "typeorm";
import ChatParticipant from "./ChatParticipant";
import Message from "./MessageEntity";


@Entity("chats")
export default class ChatEntity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @OneToMany(() => ChatParticipant, p => p.chat)
    participants: ChatParticipant[];

    @OneToMany(() => Message, m => m.chat)
    messages: Message[];

    @Column({ nullable: true })
    lastMessageId: string;

    @OneToOne(() => Message, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "lastMessageId" })
    lastMessage: Message;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
