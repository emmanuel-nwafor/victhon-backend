import PushNotificationService from "./src/services/PushNotificationService";

async function test() {
    try {
        const p = new PushNotificationService();
        console.log("Calling getExpo...");
        const result = await p["getExpo"]();
        console.log("Success! Expo class exists:", !!result.Expo);
    } catch(e) {
        console.error("Failed:", e);
    }
}
test();
