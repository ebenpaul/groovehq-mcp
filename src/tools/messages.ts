import { GrooveClient } from '../groove-client.js';
import { mutations } from '../utils/graphql-queries.js';
import { Message } from '../types/groove.js';

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

  // NOTE: a GraphQL `listMessages` used to live here but was dead code — the
  // wired listMessages tool uses ConversationTools.listMessages (REST v1),
  // and the v2 GraphQL `messages` field is not accessible to this token.

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