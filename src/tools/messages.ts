import { GrooveClient } from '../groove-client.js';
import { queries, mutations } from '../utils/graphql-queries.js';
import { Message } from '../types/groove.js';

interface ListMessagesArgs {
  conversationId: string;
  limit?: number;
  after?: string;
}

interface SendMessageArgs {
  conversationId: string;
  body: string;
  attachmentIds?: string[];
}

interface CreateNoteArgs {
  conversationId: string;
  body: string;
}

export class MessageTools {
  constructor(private client: GrooveClient) {}

  async listMessages(args: ListMessagesArgs): Promise<Message[]> {
    const variables = {
      conversationId: args.conversationId,
      first: args.limit || 50,
      after: args.after,
    };

    const response = await this.client.request<{
      messages: {
        edges: Array<{ node: Message }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string;
        };
      };
    }>(queries.listMessages, variables);

    return response.messages.edges.map(edge => edge.node);
  }

  async sendMessage(args: SendMessageArgs): Promise<Message> {
    const input = {
      body: args.body,
      attachmentIds: args.attachmentIds,
    };

    const response = await this.client.request<{
      sendMessage: {
        message: Message;
      };
    }>(mutations.sendMessage, { conversationId: args.conversationId, input });

    return response.sendMessage.message;
  }

  async createNote(args: CreateNoteArgs): Promise<Message> {
    const input = {
      body: args.body,
    };

    const response = await this.client.request<{
      createNote: {
        note: Message;
      };
    }>(mutations.createNote, { conversationId: args.conversationId, input });

    return response.createNote.note;
  }
}