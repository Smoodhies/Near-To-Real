import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

export class SqsQueueService {
  constructor({ region, queueUrl }) {
    if (!region) {
      throw new Error("SqsQueueService requires region");
    }

    if (!queueUrl) {
      throw new Error("SqsQueueService requires queueUrl");
    }

    this.client = new SQSClient({
      region,
    });

    this.queueUrl = queueUrl;
  }

  async enqueue(message) {
    if (!message || typeof message !== "object") {
      throw new Error("SQS message must be an object");
    }

    const response = await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
      })
    );

    return {
      messageId: response.MessageId,
    };
  }

  async receive({ maxNumberOfMessages = 1, waitTimeSeconds = 20, visibilityTimeout = 1800 } = {}) {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: maxNumberOfMessages,
        WaitTimeSeconds: waitTimeSeconds,
        VisibilityTimeout: visibilityTimeout,
        MessageAttributeNames: ["All"],
      })
    );

    return response.Messages ?? [];
  }

  async delete(message) {
    if (!message?.ReceiptHandle) {
      throw new Error("SQS message requires ReceiptHandle for deletion");
    }

    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      })
    );
  }
}
