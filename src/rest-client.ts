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
    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${this.apiToken}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
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

  async updateTicketState(ticketId: string | number, state: string): Promise<void> {
    await this.request(`/tickets/${ticketId}/state`, {
      method: 'PUT',
      body: JSON.stringify({ state }),
    });
  }

  async getTicket(ticketId: string | number): Promise<any> {
    const response = await this.request(`/tickets/${ticketId}`);
    return response.ticket;
  }

  async listTickets(limit?: number): Promise<any[]> {
    const endpoint = limit ? `/tickets?per_page=${limit}` : '/tickets';
    const response = await this.request(endpoint);
    return response.tickets;
  }

  async getTicketMessages(ticketId: string | number): Promise<any[]> {
    const response = await this.request(`/tickets/${ticketId}/messages`);
    return response.messages || [];
  }
}