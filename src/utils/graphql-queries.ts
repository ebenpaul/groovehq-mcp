export const CONVERSATION_FIELDS = `
  id
  number
  state
  subject
  createdAt
  updatedAt
  stateUpdatedAt
  assigned {
    agent {
      id
      email
      name
      firstName
      lastName
    }
    team {
      id
      name
    }
    at
  }
  contact {
    id
    email
    name
    firstName
    lastName
  }
  counts {
    messages
    notes
    interactions
    attachments
    stateChanges
  }
  tags {
    nodes {
      id
      name
    }
  }
  snoozed {
    by {
      id
      email
    }
    until
  }
  starred
  channel {
    id
    name
    type
    color
  }
`;

export const MESSAGE_FIELDS = `
  id
  body
  bodyPlainText
  createdAt
  updatedAt
  type
  author {
    ... on Contact {
      id
      email
      name
      firstName
      lastName
    }
    ... on Agent {
      id
      email
      name
      firstName
      lastName
      role
    }
  }
  attachments {
    id
    filename
    contentType
    size
    url
  }
`;

export const CONTACT_FIELDS = `
  id
  email
  name
  firstName
  lastName
  avatarUrl
  contactType
  conversationCount
  createdAt
  updatedAt
  companies {
    nodes {
      id
      name
    }
  }
`;

const AGENT_FIELDS = `
  id
  email
  name
  firstName
  lastName
  avatarUrl
  role
  available
`;

const KB_ARTICLE_FIELDS = `
  id
  title
  slug
  body
  bodyPlainText
  categoryId
  category {
    id
    name
    slug
  }
  published
  featured
  views
  helpfulVotes
  unhelpfulVotes
  author {
    id
    email
    name
  }
  createdAt
  updatedAt
  publishedAt
`;

const KB_CATEGORY_FIELDS = `
  id
  name
  description
  slug
  parentId
  position
  articleCount
  createdAt
  updatedAt
`;

export const queries = {
  listConversations: `
    query ListConversations(
      $first: Int
      $after: String
      $filter: ConversationFilter
      $orderBy: ConversationOrder
    ) {
      conversations(
        first: $first
        after: $after
        filter: $filter
        orderBy: $orderBy
      ) {
        edges {
          node {
            ${CONVERSATION_FIELDS}
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  getConversation: `
    query GetConversation($id: ID!) {
      conversation(id: $id) {
        ${CONVERSATION_FIELDS}
      }
    }
  `,

  listMessages: `
    query ListMessages($conversationId: ID!, $first: Int, $after: String) {
      messages(conversationId: $conversationId, first: $first, after: $after) {
        edges {
          node {
            ${MESSAGE_FIELDS}
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  listContacts: `
    query ListContacts($first: Int, $after: String, $search: String) {
      contacts(first: $first, after: $after, search: $search) {
        edges {
          node {
            ${CONTACT_FIELDS}
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  getContact: `
    query GetContact($id: ID!) {
      contact(id: $id) {
        ${CONTACT_FIELDS}
      }
    }
  `,

  listAgents: `
    query ListAgents {
      agents {
        ${AGENT_FIELDS}
      }
    }
  `,

  listKbArticles: `
    query ListKbArticles($categoryId: ID, $published: Boolean, $featured: Boolean, $first: Int, $after: String) {
      knowledgeBaseArticles(categoryId: $categoryId, published: $published, featured: $featured, first: $first, after: $after) {
        edges {
          node {
            ${KB_ARTICLE_FIELDS}
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,

  getKbArticle: `
    query GetKbArticle($id: ID!) {
      knowledgeBaseArticle(id: $id) {
        ${KB_ARTICLE_FIELDS}
      }
    }
  `,

  listKbCategories: `
    query ListKbCategories {
      knowledgeBaseCategories {
        ${KB_CATEGORY_FIELDS}
      }
    }
  `,

  searchKbArticles: `
    query SearchKbArticles($query: String!, $first: Int, $after: String) {
      searchKnowledgeBaseArticles(query: $query, first: $first, after: $after) {
        edges {
          node {
            ${KB_ARTICLE_FIELDS}
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,
};

export const mutations = {
  // Note: Conversation mutations are not currently available in the Groove GraphQL API
  // The Inbox API is still being built by Groove
  
  // createConversation: Not available
  // updateConversation: Not available

  sendMessage: `
    mutation SendMessage($conversationId: ID!, $input: SendMessageInput!) {
      sendMessage(conversationId: $conversationId, input: $input) {
        message {
          ${MESSAGE_FIELDS}
        }
      }
    }
  `,

  createNote: `
    mutation CreateNote($conversationId: ID!, $input: CreateNoteInput!) {
      createNote(conversationId: $conversationId, input: $input) {
        note {
          ${MESSAGE_FIELDS}
        }
      }
    }
  `,

  createContact: `
    mutation CreateContact($input: CreateContactInput!) {
      createContact(input: $input) {
        contact {
          ${CONTACT_FIELDS}
        }
      }
    }
  `,

  updateContact: `
    mutation UpdateContact($id: ID!, $input: UpdateContactInput!) {
      updateContact(id: $id, input: $input) {
        contact {
          ${CONTACT_FIELDS}
        }
      }
    }
  `,
};