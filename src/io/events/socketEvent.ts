import SocketNamespace from "../namespaces/SocketNamespace";
import SocketHandler from "../handlers/SocketHandler";

const socketEvent = new SocketNamespace();

socketEvent.onConnection(SocketHandler.onConnection.bind(SocketHandler));
socketEvent.register("send-message", SocketHandler.sendMessage.bind(SocketHandler));
socketEvent.register("enter-chat", SocketHandler.enterChat.bind(SocketHandler));
socketEvent.register("leave-chat", SocketHandler.leaveChat.bind(SocketHandler));
socketEvent.register("mark-as-read", SocketHandler.markAsRead.bind(SocketHandler));
socketEvent.register("typing", SocketHandler.typing.bind(SocketHandler));
socketEvent.register("delete-messages", SocketHandler.deleteMessages.bind(SocketHandler));
socketEvent.register("disconnect", SocketHandler.disconnect.bind(SocketHandler));

export default socketEvent;