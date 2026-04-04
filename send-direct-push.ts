import 'dotenv/config';
import { Expo } from 'expo-server-sdk';

async function sendDirect() {
    let expo = new Expo();
    const pushToken = 'ExponentPushToken[B0adyrKwM_yqnsDfby_F4t]';

    if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        return;
    }

    let messages = [];
    messages.push({
        to: pushToken,
        sound: 'default',
        title: 'Victhon Booking Update',
        body: 'Great news! Your booking request has been accepted by the professional.',
        data: { withSome: 'data' },
    });

    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
    
    console.log("Sending direct push to:", pushToken);

    for (let chunk of chunks) {
        try {
            let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            console.log("Tickets:", ticketChunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error("Error sending chunk:", error);
        }
    }
}

sendDirect();
