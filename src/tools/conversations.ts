import { GrooveClient } from '../groove-client.js';
import { GrooveRestClient } from '../rest-client.js';
import { queries, mutations } from '../utils/graphql-queries.js';
import { Conversation } from '../types/groove.js';

interface ListConversationsArgs {
  state?: 'unread' | 'opened' | 'closed' | 'snoozed';
  assignedAgentId?: string;
  assignedTeamId?: string;
  contactId?: string;
  channelId?: string;
  tagIds?: string[];
  limit?: number;
}

interface UpdateConversationArgs {
  id: string;
  state?: 'opened' | 'closed' | 'snoozed';
  assignedAgentId?: string;
  assignedTeamId?: string;
  tagIds?: string[];
  snoozedUntil?: string;
}

interface CreateConversationArgs {
  contactId: string;
  subject: string;
  body: string;
  assignedAgentId?: string;
  assignedTeamId?: string;
  tagIds?: string[];
}

export class ConversationTools {
  private restClient: GrooveRestClient;

  constructor(private client: GrooveClient, apiToken: string) {
    this.restClient = new GrooveRestClient(apiToken);
  }

  private convertTicketToConversation(ticket: any): Conversation {
    // Convert REST API ticket format to GraphQL-like Conversation format
    return {
      id: `cnv_${ticket.id}`,
      number: ticket.number,
      state: ticket.state.toUpperCase() as any,
      subject: ticket.title,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      stateUpdatedAt: ticket.state_changed_at,
      assigned: undefined, // Would need additional mapping for assigned agent/team
      contact: {
        id: `co_${ticket.links?.customer?.id || 'unknown'}`,
        email: ticket.links?.customer?.href?.split('/').pop() || undefined,
        name: ticket.links?.customer?.href?.split('/').pop() || undefined,
        firstName: ticket.links?.customer?.href?.split('/').pop() || undefined,
        lastName: undefined,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      },
      counts: {
        messages: ticket.message_count || 0,
        notes: 0,
        interactions: ticket.interaction_count || 0,
        attachments: ticket.attachment_count || 0,
        stateChanges: 0,
      },
      tags: {
        nodes: (ticket.tags || []).map((tag: string) => ({ id: tag, name: tag })),
      },
      snoozed: ticket.snoozed_until ? {
        by: { id: ticket.snoozed_by_id || '', email: '' },
        until: ticket.snoozed_until,
      } : undefined,
      starred: false,
      channel: {
        __typename: 'Channel',
        id: `ch_${ticket.mailbox_id}`,
        name: ticket.mailbox,
        type: 'FORWARDING' as const,
        conversationCount: 0,
        color: 'rgba(220, 86, 56, 1)',
        state: 'ACTIVE' as const,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      },
    };
  }

  async listConversations(args: ListConversationsArgs): Promise<Conversation[]> {
    // Use REST API since GraphQL doesn't support conversations yet
    const tickets = await this.restClient.listTickets(args.limit);
    
    // Apply filters on the client side since REST API has limited filtering
    let filteredTickets = tickets;
    
    if (args.state) {
      filteredTickets = filteredTickets.filter(ticket => 
        ticket.state.toLowerCase() === args.state!.toLowerCase()
      );
    }
    
    if (args.channelId) {
      const channelNumber = args.channelId.replace('ch_', '');
      filteredTickets = filteredTickets.filter(ticket => 
        ticket.mailbox_id === channelNumber
      );
    }
    
    // Convert REST tickets to GraphQL-like Conversation objects
    return filteredTickets.map(ticket => this.convertTicketToConversation(ticket));
  }

  async getConversation(id: string): Promise<Conversation | null> {
    try {
      // Convert GraphQL ID format (cnv_12345) to REST format (12345)
      const ticketId = id.replace('cnv_', '');
      const ticket = await this.restClient.getTicket(ticketId);
      
      return this.convertTicketToConversation(ticket);
    } catch (error) {
      // If ticket not found, return null
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async createConversation(args: CreateConversationArgs): Promise<Conversation> {
    throw new Error(
      'Conversation creation is not currently supported by the Groove REST API v1. ' +
      'The GraphQL API with conversation creation is still being built by Groove. ' +
      'Please check the Groove developer documentation for updates.'
    );
  }

  async updateConversation(args: UpdateConversationArgs): Promise<Conversation> {
    // Use REST API for conversation updates since GraphQL doesn't support it yet
    if (args.state) {
      // Convert GraphQL ID format (cnv_12345) to REST format (12345)
      const ticketId = args.id.replace('cnv_', '');
      await this.restClient.updateTicketState(ticketId, args.state);
      
      // Return the updated conversation by fetching it directly via REST
      const updatedTicket = await this.restClient.getTicket(ticketId);
      return this.convertTicketToConversation(updatedTicket);
    }
    
    throw new Error(
      'Only state updates are currently supported via REST API fallback. ' +
      'Other conversation updates require GraphQL API support which is not yet available.'
    );
  }

  async closeConversation(id: string): Promise<Conversation> {
    return this.updateConversation({ id, state: 'closed' });
  }

  async listMessages(conversationId: string, limit?: number): Promise<any[]> {
    // Convert GraphQL ID format (cnv_12345) to REST format (12345)
    const ticketId = conversationId.replace('cnv_', '');
    const messages = await this.restClient.getTicketMessages(ticketId);
    
    // Apply limit if specified
    if (limit && messages.length > limit) {
      return messages.slice(0, limit);
    }
    
    return messages;
  }
}