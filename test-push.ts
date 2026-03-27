import PushNotificationService from './src/services/PushNotificationService';
import { UserType } from './src/types/constants';
import { AppDataSource } from './src/data-source';
import dotenv from 'dotenv';

dotenv.config();

async function testPush() {
    const pushService = new PushNotificationService();
    
    // Parse arguments
    const args = process.argv.slice(2);
    const isUser = args.includes('--user');
    const isProfessional = args.includes('--professional');
    const identifier = args.find((arg, i) => i > 0 && (args[i-1] === '--user' || args[i-1] === '--professional'));
    const directToken = !isUser && !isProfessional ? args[0] : null;

    if (!identifier && !directToken) {
        console.error('Usage:');
        console.error('  npx ts-node test-push.ts <token>                (Direct token)');
        console.error('  npx ts-node test-push.ts --user <id>            (User by ID)');
        console.error('  npx ts-node test-push.ts --professional <id>    (Professional by ID)');
        process.exit(1);
    }

    try {
        // Initialize Data Source if needed for DB lookups
        if (isUser || isProfessional) {
            console.log('Initializing database connection...');
            await AppDataSource.initialize();
        }

        let result;
        if (isUser || isProfessional) {
            const userType = isProfessional ? UserType.PROFESSIONAL : UserType.USER;
            console.log(`Sending test notification to ${userType} ID: ${identifier}...`);
            result = await pushService.sendToUser(
                identifier!,
                userType,
                'Test Notification',
                'This is a test notification from Victhon Backend verification script.',
                { test: true, timestamp: new Date().toISOString() }
            );
        } else {
            console.log(`Sending test notification to token: ${directToken}...`);
            result = await pushService.sendNotification(
                directToken!,
                'Test Notification',
                'This is a test notification from Victhon Backend verification script.',
                { test: true, timestamp: new Date().toISOString() }
            );
        }

        if (result) {
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.log('Failed to send notification (likely no token found).');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}

testPush();
