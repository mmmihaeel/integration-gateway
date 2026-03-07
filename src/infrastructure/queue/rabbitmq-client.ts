import amqp, { type Channel, type ChannelModel, type ConsumeMessage, type Options } from 'amqplib';
import { getConfig } from '../config/env.js';
import type { ProcessEventMessage, ReplayEventMessage } from './messages.js';

interface QueueNames {
  processQueue: string;
  retryQueue: string;
  replayQueue: string;
}

function parseMessage<T>(message: Pick<ConsumeMessage, 'content'>): T {
  return JSON.parse(message.content.toString('utf8')) as T;
}

export class RabbitMqClient {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  private readonly queueNames: QueueNames;

  constructor(private readonly amqpUrl = getConfig().RABBITMQ_URL) {
    const config = getConfig();
    this.queueNames = {
      processQueue: config.RABBITMQ_PROCESS_QUEUE,
      retryQueue: config.RABBITMQ_RETRY_QUEUE,
      replayQueue: config.RABBITMQ_REPLAY_QUEUE,
    };
  }

  async connect(): Promise<void> {
    if (this.channel) {
      return;
    }

    this.connection = await amqp.connect(this.amqpUrl);
    this.channel = await this.connection.createChannel();
    await this.ensureTopology();
  }

  private getChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not connected');
    }

    return this.channel;
  }

  private async ensureTopology(): Promise<void> {
    const channel = this.getChannel();

    await channel.assertQueue(this.queueNames.processQueue, {
      durable: true,
    });

    await channel.assertQueue(this.queueNames.replayQueue, {
      durable: true,
    });

    await channel.assertQueue(this.queueNames.retryQueue, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: this.queueNames.processQueue,
    });

    await channel.prefetch(5);
  }

  async publishProcessMessage(message: ProcessEventMessage): Promise<void> {
    const channel = this.getChannel();
    const ok = channel.sendToQueue(
      this.queueNames.processQueue,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: message.correlationId,
      },
    );

    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async publishReplayMessage(message: ReplayEventMessage): Promise<void> {
    const channel = this.getChannel();
    const ok = channel.sendToQueue(
      this.queueNames.replayQueue,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: message.correlationId,
      },
    );

    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async publishRetryMessage(message: ProcessEventMessage, delayMs: number): Promise<void> {
    const channel = this.getChannel();
    const options: Options.Publish = {
      persistent: true,
      contentType: 'application/json',
      expiration: String(delayMs),
      messageId: `${message.correlationId}:retry:${message.attemptNo}`,
    };

    const ok = channel.sendToQueue(
      this.queueNames.retryQueue,
      Buffer.from(JSON.stringify(message)),
      options,
    );

    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async consumeProcessMessages(
    handler: (message: ProcessEventMessage) => Promise<void>,
  ): Promise<void> {
    const channel = this.getChannel();

    await channel.consume(this.queueNames.processQueue, async (message) => {
      if (!message) {
        return;
      }

      try {
        const parsed = parseMessage<ProcessEventMessage>(message);
        await handler(parsed);
        channel.ack(message);
      } catch (error) {
        console.error('Failed to handle process queue message', error);
        channel.nack(message, false, false);
      }
    });
  }

  async consumeReplayMessages(
    handler: (message: ReplayEventMessage) => Promise<void>,
  ): Promise<void> {
    const channel = this.getChannel();

    await channel.consume(this.queueNames.replayQueue, async (message) => {
      if (!message) {
        return;
      }

      try {
        const parsed = parseMessage<ReplayEventMessage>(message);
        await handler(parsed);
        channel.ack(message);
      } catch (error) {
        console.error('Failed to handle replay queue message', error);
        channel.nack(message, false, false);
      }
    });
  }

  async getQueueDepth(queueName: keyof QueueNames): Promise<number> {
    const channel = this.getChannel();
    const queue = this.queueNames[queueName];
    const info = await channel.checkQueue(queue);
    return info.messageCount;
  }

  async purgeQueues(): Promise<void> {
    const channel = this.getChannel();
    await channel.purgeQueue(this.queueNames.processQueue);
    await channel.purgeQueue(this.queueNames.retryQueue);
    await channel.purgeQueue(this.queueNames.replayQueue);
  }

  async pullOneMessage<T>(queueName: keyof QueueNames): Promise<T | null> {
    const channel = this.getChannel();
    const queue = this.queueNames[queueName];
    const message = await channel.get(queue, { noAck: true });
    if (!message) {
      return null;
    }

    return parseMessage<T>(message);
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
}
