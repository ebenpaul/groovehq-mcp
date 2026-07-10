import { GrooveClient } from '../groove-client.js';
import { queries, mutations } from '../utils/graphql-queries.js';
import { Contact } from '../types/groove.js';

interface ListContactsArgs {
  search?: string;
  limit?: number;
  after?: string;
}

interface CreateContactArgs {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
}

interface UpdateContactArgs {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
}

export class ContactTools {
  constructor(private client: GrooveClient) {}

  async listContacts(args: ListContactsArgs = {}): Promise<Contact[]> {
    const variables = {
      first: args.limit || 20,
      after: args.after,
      search: args.search,
    };

    const response = await this.client.request<{
      contacts: {
        edges: Array<{ node: Contact }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string;
        };
      };
    }>(queries.listContacts, variables);

    return response.contacts.edges.map(edge => edge.node);
  }

  async getContact(id: string): Promise<Contact | null> {
    const response = await this.client.request<{
      contact: Contact | null;
    }>(queries.getContact, { id });

    return response.contact;
  }

  async createContact(args: CreateContactArgs): Promise<Contact> {
    const input = {
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      company: args.company,
      title: args.title,
      phone: args.phone,
    };

    const response = await this.client.request<{
      createContact: {
        contact: Contact;
      };
    }>(mutations.createContact, { input });

    return response.createContact.contact;
  }

  async updateContact(args: UpdateContactArgs): Promise<Contact> {
    const input: any = {};
    
    if (args.email !== undefined) input.email = args.email;
    if (args.firstName !== undefined) input.firstName = args.firstName;
    if (args.lastName !== undefined) input.lastName = args.lastName;
    if (args.company !== undefined) input.company = args.company;
    if (args.title !== undefined) input.title = args.title;
    if (args.phone !== undefined) input.phone = args.phone;

    const response = await this.client.request<{
      updateContact: {
        contact: Contact;
      };
    }>(mutations.updateContact, { id: args.id, input });

    return response.updateContact.contact;
  }
}