// Groove REST API v1 client.
//
// This is the ONLY path that can reach conversation/ticket data: our API token
// has no visibility into the v2 GraphQL conversation surface (no `conversations`
// / `conversation` / `messages` root fields, and `Conversation` / `Message` /
// `ConversationFilter` types do not exist for this token — see
// docs/audit/assumption-inventory.md). v1 `GET /tickets` returns 200 with real
// data, so the server ships on v1 by design, not by accident.

export interface GroovePagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  next_page: number | null;
  previous_page: number | null;
  per_page?: number;
}

export interface TicketsPage {
  tickets: any[];
  pagination: GroovePagination;
}

export interface ListTicketsParams {
  // All map 1:1 to documented Groove v1 GET /tickets query params.
  customer?: string; // email OR contact id — server-side contact filter
  assignee?: string;
  state?: string;
  folder?: string;
  page?: number;
  per_page?: number; // Groove hard max is 50
}

export const GROOVE_MAX_PER_PAGE = 50;

export class GrooveRestClient {
  private apiToken: string;
  private baseUrl: string;

  constructor(apiToken: string, baseUrl: string = 'https://api.groovehq.com/v1') {
    if (!apiToken) {
      throw new Error('Groove API token is required');
    }

    this.apiToken = apiToken;
    this.baseUrl = baseUrl;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Auth via Authorization header — NEVER the access_token query param, which
    // would leak an admin credential into URLs, logs, and proxies.
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`REST API Error (${response.status}): ${errorText}`);
    }

    // 204 No Content responses don't have a body
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  }

  private buildQuery(params: ListTicketsParams): string {
    const qs = new URLSearchParams();
    if (params.customer) qs.set('customer', params.customer);
    if (params.assignee) qs.set('assignee', params.assignee);
    if (params.state) qs.set('state', params.state);
    if (params.folder) qs.set('folder', params.folder);
    if (params.page) qs.set('page', String(params.page));
    if (params.per_page) {
      qs.set('per_page', String(Math.min(params.per_page, GROOVE_MAX_PER_PAGE)));
    }
    const s = qs.toString();
    return s ? `?${s}` : '';
  }

  /**
   * Fetch ONE page of tickets with server-side filters, returning both the
   * tickets and Groove's pagination metadata (so callers can loop and can
   * report total_count honestly).
   */
  async listTicketsPage(params: ListTicketsParams = {}): Promise<TicketsPage> {
    const response = await this.request<{
      tickets: any[];
      meta?: { pagination?: Partial<GroovePagination> };
    }>(`/tickets${this.buildQuery(params)}`);

    const p = response.meta?.pagination ?? {};
    const tickets = response.tickets ?? [];
    return {
      tickets,
      pagination: {
        current_page: p.current_page ?? params.page ?? 1,
        total_pages: p.total_pages ?? 1,
        total_count: p.total_count ?? tickets.length,
        next_page: p.next_page ?? null,
        previous_page: p.previous_page ?? null,
        per_page: p.per_page ?? params.per_page,
      },
    };
  }

  async getTicket(ticketId: string | number): Promise<any> {
    const response = await this.request(`/tickets/${ticketId}`);
    return response.ticket;
  }

  async getTicketMessages(ticketId: string | number): Promise<any[]> {
    const response = await this.request(`/tickets/${ticketId}/messages`);
    return response.messages || [];
  }

  async updateTicketState(ticketId: string | number, state: string): Promise<void> {
    await this.request(`/tickets/${ticketId}/state`, {
      method: 'PUT',
      body: JSON.stringify({ state }),
    });
  }
}
