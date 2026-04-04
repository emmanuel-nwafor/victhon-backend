import * as amqp from 'amqp-connection-manager';
import {Channel, ChannelWrapper} from 'amqp-connection-manager';
import {QueueName, QUEUES} from '../config/queues';
import env, {EnvKey} from "../config/env";
import logger from "../config/logger";

export class RabbitMQ {
    private static connection: amqp.AmqpConnectionManager | null = null;
    private static channels: { [key in QueueName]?: ChannelWrapper } = {};
    private static PREFETCH_COUNT = 1; // Process one message at a time per consumer
    private static RABBITMQ_URL = env(EnvKey.RABBIT_MQ)!;


    static async connect() {
        if (!this.connection) {
            try {
                if (!RabbitMQ.RABBITMQ_URL) {
                   logger.error('Missing RABBITMQ_URL in environment configuration');
                   return;
                }
                
                this.connection = amqp.connect([RabbitMQ.RABBITMQ_URL], {
                    heartbeatIntervalInSeconds: 30,
                    reconnectTimeInSeconds: 5,
                });
                
                this.connection.on('connect', () => {
                   logger.info('RabbitMQ connected successfully');
                });
                
                this.connection.on('disconnect', (err) => {
                   logger.error('RabbitMQ disconnected', err);
                });
                
                this.connection.on('connectFailed', (err) => {
                   logger.warn('RabbitMQ connection failed', err);
                });
            } catch (error) {
                logger.error('Error during RabbitMQ connect:', error);
            }
        }
    }

    static async getChannel(queueName: QueueName): Promise<ChannelWrapper> {
        if (!this.connection) {
            await this.connect();
        }
        if (!this.channels[queueName]) {
            this.channels[queueName] = this.connection!.createChannel({
                setup: async (channel: Channel) => {
                    // Assert the main topic exchange
                    await channel.assertExchange(QUEUES[queueName]!.exchange, 'topic', { durable: true });

                    // Assert the dead-letter exchange
                    const dlxName = `${QUEUES[queueName]!.exchange}_dlx`;
                    await channel.assertExchange(dlxName, 'direct', { durable: true });

                    // Assert the dead-letter queue
                    const dlqName = `${QUEUES[queueName]!.name}.dlq`;
                    await channel.assertQueue(dlqName, { durable: true });

                    // Bind the dead-letter queue to the dead-letter exchange
                    await channel.bindQueue(dlqName, dlxName, dlqName);

                    // Assert the main queue with dead-letter configuration
                    await channel.assertQueue(QUEUES[queueName]!.name, {
                        durable: QUEUES[queueName]!.durable,
                        deadLetterExchange: dlxName,
                        deadLetterRoutingKey: dlqName,
                    });

                    // Bind the main queue to the main exchange
                    await channel.bindQueue(
                        QUEUES[queueName]!.name,
                        QUEUES[queueName]!.exchange,
                        QUEUES[queueName]!.routingKeyPattern
                    );

                    // set prefetch limit
                    await channel.prefetch(RabbitMQ.PREFETCH_COUNT);
                },
            });
            await this.channels[queueName]!.waitForConnect();
        }
        return this.channels[queueName]!;
    }

    static async publishToExchange(queueName: QueueName, eventType: string, message: any) {
        try {
            if (!QUEUES[queueName]) {
                throw new Error(`Invalid queue: ${queueName}`);
            }
            const channel = await this.getChannel(queueName);
            await channel.publish(QUEUES[queueName].exchange, eventType, Buffer.from(JSON.stringify(message)), {
                persistent: true,
            });
            return true;
        } catch (error) {
            console.error('Failed to publish: ', error);
            return false;
        }
    }

    static async startConsumer(queueName: QueueName, io: any = null) {
        try {
            const channel = await RabbitMQ.getChannel(queueName);

            await channel.consume(
                QUEUES[queueName]!.name,
                async (msg) => {
                    if (msg) {
                        try {
                            const message = JSON.parse(msg.content.toString());
                            const { eventType, payload } = message;

                            if (!eventType || !QUEUES[queueName]!.handlers[eventType]) {
                                logger.error(`Unknown eventType: ${eventType} in ${queueName}`);
                                channel.nack(msg, false, false);
                                return;
                            }

                            await QUEUES[queueName]!.handlers[eventType](message, io);
                            channel.ack(msg);
                        } catch (err) {
                            console.error(`Error processing message on ${queueName}:`, err);
                            channel.nack(msg, false, false);
                        }
                    }
                },
                { noAck: false }
            );
            console.log(`Consumer started for ${queueName}`);
        } catch (err) {
            console.error(`Consumer error for ${queueName}:`, err);
        }
    }

    static async close() {
        try {
            for (const queueName of Object.keys(this.channels) as QueueName[]) {
                await this.channels[queueName]?.close();
                delete this.channels[queueName];
            }
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }
            logger.info('RabbitMQ connection closed');
        } catch (error: any) {
            logger.error('Error closing RabbitMQ connection:', {
                error: error.message,
                stack: error.stack,
            });
        }
    }
}