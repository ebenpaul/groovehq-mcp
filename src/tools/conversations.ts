import { GrooveRestClient, ListTicketsParams, GROOVE_MAX_PER_PAGE } from '../rest-client.js';
import { Conversation } from '../types/groove.js';

interface ListConversationsArgs {
  // Server-side filters — each maps to a documented Groove v1 /tickets param.
  customer?: string; // vendor email OR Groove contact id
  contactId?: string; // back-compat alias for `customer`
  state?: 'unread' | 'opened' | 'closed' | 'snoozed';
  assignee?: string;
  folder?: string;
  // Explicit caller cap on TOTAL results. Omit to fetch every page.
  maxResults?: number;
  limit?: number; // back-compat alias for `maxResults`

  // Not supported server-side by Groove v1 /tickets (see UNSUPPORTED below).
  // Accepted so callers get an explicit warning instead of a silent wrong answer.
  channelId?: string;
  assignedAgentId?: string;
  assignedTeamId?: string;
  tagIds?: string[];
}

export interface ListConversationsResult {
  pagination: {
    total_count: number; // Groove's true total for this exact query
    returned: number; // conversations actually returned in this response
    complete: boolean; // returned === total_count (nothing hidden)
    truncated: boolean; // capped by maxResults — MORE data exists
    pages_fetched: number;
    per_page: number;
    note: string;
  };
  filtersApplied: ListTicketsParams;
  unsupportedFilters?: string[]; // requested filters we could NOT apply
  conversations: Conversation[];
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

  constructor(apiToken: string) {
    this.restClient = new GrooveRestClient(apiToken);
  }

  private convertTicketToConversation(ticket: any): Conversation {
    // Map a Groove v1 REST ticket into the Conversation shape the tools return.
    // The `id` is the BARE ticket id — the same value getConversation and
    // listMessages drill on (verified live on ticket 6079). No `cnv_` prefix.
    return {
      id: String(ticket.id),
      number: ticket.number,
      state: (ticket.state ? ticket.state.toUpperCase() : 'OPENED') as any,
      subject: ticket.title,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      stateUpdatedAt: ticket.state_changed_at,
      assigned: undefined, // Would need additional mapping for assigned agent/team
      contact: {
        id: ticket.links?.customer?.id ? String(ticket.links.customer.id) : 'unknown',
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
      snoozed: ticket.snoozed_until
        ? {
            by: { id: ticket.snoozed_by_id || '', email: '' },
            until: ticket.snoozed_until,
          }
        : undefined,
      starred: false,
      channel: {
        __typename: 'Channel',
        id: ticket.mailbox_id ? String(ticket.mailbox_id) : 'unknown',
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

  /**
   * List conversations for a vendor/contact (or the whole account), filtered
   * SERVER-SIDE by Groove v1 and paged to completion.
   *
   * There is NO client-side filtering here. The previous implementation fetched
   * the 50 most-recent tickets account-wide and filtered by contact in JS,
   * which silently returned ~6% of a vendor's conversations and presented them
   * as complete. That defect is deleted. Every filter is pushed to Groove; any
   * filter Groove v1 can't honor is reported in `unsupportedFilters` rather than
   * approximated. Every response states total_count and whether it is complete.
   */
  async listConversations(args: ListConversationsArgs): Promise<ListConversationsResult> {
    const customer = args.customer ?? args.contactId;
    const maxResults = args.maxResults ?? args.limit;

    const filters: ListTicketsParams = {};
    if (customer) filters.customer = customer;
    if (args.state) filters.state = args.state;
    if (args.assignee) filters.assignee = args.assignee;
    if (args.folder) filters.folder = args.folder;

    // Filters with no documented Groove v1 /tickets equivalent. We refuse to
    // approximate them client-side (that is exactly the bug we removed).
    const unsupportedFilters: string[] = [];
    if (args.channelId) {
      unsupportedFilters.push(
        `channelId=${args.channelId}: Groove v1 GET /tickets has no channel/mailbox filter param; not applied (results are NOT scoped to this channel).`
      );
    }
    if (args.tagIds?.length) {
      unsupportedFilters.push(
        `tagIds=${args.tagIds.join(',')}: Groove v1 GET /tickets has no tag filter param; not applied.`
      );
    }
    if (args.assignedAgentId) {
      unsupportedFilters.push(
        `assignedAgentId=${args.assignedAgentId}: use \`assignee\` (Groove v1 param) instead; not applied.`
      );
    }
    if (args.assignedTeamId) {
      unsupportedFilters.push(
        `assignedTeamId=${args.assignedTeamId}: Groove v1 GET /tickets has no team filter param; not applied.`
      );
    }

    const per_page = GROOVE_MAX_PER_PAGE;
    const tickets: any[] = [];
    let page = 1;
    let pagesFetched = 0;
    let totalCount = 0;
    let truncated = false;

    // Safety ceiling so a misbehaving pagination cursor can't loop forever.
    // Computed from Groove's own total_pages after the first page.
    let hardPageCap = 100_000;

    while (page && pagesFetched < hardPageCap) {
      const res = await this.restClient.listTicketsPage({ ...filters, page, per_page });
      pagesFetched++;
      totalCount = res.pagination.total_count;
      hardPageCap = Math.min(hardPageCap, (res.pagination.total_pages || 1) + 2);
      tickets.push(...res.tickets);

      if (maxResults && tickets.length >= maxResults) {
        truncated = totalCount > maxResults;
        tickets.length = maxResults;
        break;
      }
      if (res.tickets.length === 0) break;
      page = res.pagination.next_page ?? 0;
    }

    const conversations = tickets.map((t) => this.convertTicketToConversation(t));
    const returned = conversations.length;
    const complete = returned === totalCount && !truncated;

    const note = complete
      ? `Complete: all ${totalCount} matching conversation(s) returned.`
      : `INCOMPLETE — returned ${returned} of ${totalCount} matching conversation(s)` +
        (truncated ? ` (capped by maxResults=${maxResults}).` : `.`) +
        ` Do NOT treat this as the full set; ${totalCount - returned} more exist.`;

    return {
      pagination: {
        total_count: totalCount,
        returned,
        complete,
        truncated,
        pages_fetched: pagesFetched,
        per_page,
        note,
      },
      filtersApplied: filters,
      ...(unsupportedFilters.length ? { unsupportedFilters } : {}),
      conversations,
    };
  }

  async getConversation(id: string): Promise<Conversation | null> {
    try {
      // Bare v1 integer ticket id. Tolerate a legacy `cnv_` prefix defensively.
      const ticketId = id.replace(/^cnv_/, '');
      const ticket = await this.restClient.getTicket(ticketId);
      return this.convertTicketToConversation(ticket);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async createConversation(_args: CreateConversationArgs): Promise<Conversation> {
    throw new Error(
      'Conversation creation is not supported. This is a read-only research server, ' +
        'and the v2 GraphQL conversation surface is not accessible to this token.'
    );
  }

  async updateConversation(args: UpdateConversationArgs): Promise<Conversation> {
    if (args.state) {
      const ticketId = args.id.replace(/^cnv_/, '');
      await this.restClient.updateTicketState(ticketId, args.state);
      const updatedTicket = await this.restClient.getTicket(ticketId);
      return this.convertTicketToConversation(updatedTicket);
    }

    throw new Error(
      'Only state updates are currently supported via REST API. ' +
        'Other conversation updates require GraphQL API support which is not available to this token.'
    );
  }

  async closeConversation(id: string): Promise<Conversation> {
    return this.updateConversation({ id, state: 'closed' });
  }

  async listMessages(conversationId: string, limit?: number): Promise<any[]> {
    // Bare v1 integer ticket id. Tolerate a legacy `cnv_` prefix defensively.
    const ticketId = conversationId.replace(/^cnv_/, '');
    const messages = await this.restClient.getTicketMessages(ticketId);

    if (limit && messages.length > limit) {
      return messages.slice(0, limit);
    }

    return messages;
  }
}
