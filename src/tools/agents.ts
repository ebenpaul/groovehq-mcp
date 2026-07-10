import { GrooveClient } from '../groove-client.js';
import { queries } from '../utils/graphql-queries.js';
import { Agent } from '../types/groove.js';

export class AgentTools {
  constructor(private client: GrooveClient) {}

  async listAgents(): Promise<Agent[]> {
    const response = await this.client.request<{
      agents: Agent[];
    }>(queries.listAgents);

    return response.agents;
  }

  async getAgent(id: string): Promise<Agent | null> {
    // Since Groove doesn't have a specific getAgent query, we'll list all agents
    // and find the one with the matching ID
    const agents = await this.listAgents();
    return agents.find(agent => agent.id === id) || null;
  }

  async getAvailableAgents(): Promise<Agent[]> {
    const agents = await this.listAgents();
    return agents.filter(agent => agent.available);
  }
}