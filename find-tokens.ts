import { AppDataSource } from './src/data-source';
import { User } from './src/entities/User';
import { Professional } from './src/entities/Professional';
import { Not, IsNull } from 'typeorm';

async function findTokens() {
    try {
        await AppDataSource.initialize();
        const users = await AppDataSource.getRepository(User).find({
            where: { pushToken: Not(IsNull()) },
            select: ['id', 'firstName', 'pushToken'],
            take: 3
        });
        const pros = await AppDataSource.getRepository(Professional).find({
            where: { pushToken: Not(IsNull()) },
            select: ['id', 'businessName', 'pushToken'],
            take: 3
        });

        console.log('Results:');
        console.log(JSON.stringify({ users, pros }, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await AppDataSource.destroy();
    }
}

findTokens();
