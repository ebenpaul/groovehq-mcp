import { GraphQLClient } from 'graphql-request';
import { GraphQLError } from './types/groove.js';

export class GrooveClient {
  private client: GraphQLClient;

  constructor(apiToken: string, apiUrl: string = 'https://api.groovehq.com/v2/graphql') {
    if (!apiToken) {
      throw new Error('Groove API token is required');
    }

    this.client = new GraphQLClient(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async request<T = any>(query: string, variables?: any): Promise<T> {
    try {
      return await this.client.request<T>(query, variables);
    } catch (error: any) {
      if (error.response?.errors) {
        const graphqlError = error.response.errors[0] as GraphQLError;
        throw new Error(`GraphQL Error: ${graphqlError.message}`);
      }
      throw error;
    }
  }

  async validateConnection(): Promise<boolean> {
    const query = `
      query ValidateConnection {
        me {
          id
          email
        }
      }
    `;

    try {
      await this.request(query);
      return true;
    } catch (error) {
      console.error('Failed to validate Groove connection:', error);
      return false;
    }
  }
}