export interface Channel {
  __typename: string;
  id: string;
  name: string;
  type: 'EMAIL' | 'TWITTER' | 'FACEBOOK' | 'WIDGET' | 'API' | 'CHAT' | 'FORWARDING';
  conversationCount: number;
  color: string;
  state: 'ACTIVE' | 'INACTIVE' | 'DELETED';
  senderName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  number: number;
  state: 'UNREAD' | 'OPENED' | 'CLOSED' | 'SNOOZED' | 'DELETED' | 'SPAM' | 'TRASH';
  subject?: string;
  createdAt: string;
  updatedAt: string;
  stateUpdatedAt?: string;
  assigned?: {
    agent?: Agent;
    team?: Team;
    at?: string;
  };
  contact?: Contact;
  counts: {
    messages: number;
    notes: number;
    interactions: number;
    attachments: number;
    stateChanges: number;
  };
  tags: {
    nodes: Tag[];
  };
  snoozed?: {
    by?: {
      id: string;
      email: string;
    };
    until?: string;
  };
  starred: boolean;
  channel?: Channel;
}

export interface Message {
  id: string;
  conversationId: string;
  author: Contact | Agent;
  body: string;
  bodyPlainText?: string;
  createdAt: string;
  updatedAt: string;
  type: 'message' | 'note';
  attachments: Attachment[];
}

export interface Contact {
  id: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  contactType?: string;
  conversationCount?: number;
  createdAt: string;
  updatedAt: string;
  companies?: {
    nodes: Array<{
      id: string;
      name: string;
    }>;
  };
}

export interface Agent {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role: 'admin' | 'agent';
  available: boolean;
}

export interface Team {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  slug: string;
  body: string;
  bodyPlainText?: string;
  categoryId: string;
  category?: KnowledgeBaseCategory;
  published: boolean;
  featured: boolean;
  views: number;
  helpfulVotes: number;
  unhelpfulVotes: number;
  author?: Agent;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface KnowledgeBaseCategory {
  id: string;
  name: string;
  description?: string;
  slug: string;
  parentId?: string;
  parent?: KnowledgeBaseCategory;
  position: number;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GraphQLError {
  message: string;
  extensions?: {
    code: string;
    [key: string]: any;
  };
}