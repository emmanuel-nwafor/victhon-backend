import PushNotificationService from './src/services/PushNotificationService';
import dotenv from 'dotenv';

dotenv.config();

async function testPush() {
    const pushService = new PushNotificationService();
    const testToken = process.argv[2];

    if (!testToken) {
        console.error('Please provide an Expo push token as an argument');
        process.exit(1);
    }

    console.log(`Sending test notification to ${testToken}...`);
    
    try {
        const result = await pushService.sendNotification(
            testToken,
            'Test Notification',
            'This is a test notification from Victhon Backend verification script.',
            { test: true }
        );
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testPush();
