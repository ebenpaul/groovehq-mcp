# Groove MCP Server

A Model Context Protocol (MCP) server for Groove HQ, providing access to customer support ticketing, CRM, and knowledge base functionality through the Groove GraphQL API v2.

## Installation

Get your GROOVE_API_TOKEN from https://YOUR_SUBDOMAIN.groovehq.com/settings/developer/api?tat-cursor=1&tat-entityType=accessToken&tat-pageSize=9999

Then add the Groove MCP server to Claude Code:

```bash
claude mcp add groove-mcp npx groove-mcp -s user --env GROOVE_API_TOKEN=your_groove_api_token_here
```

You can also optionally set the `GROOVE_API_URL` as an environment variable (defaults to `https://api.groovehq.com/v2/graphql`).

If you'd like to run it locally, clone this repo and then run:

```
claude mcp add groove-mcp node ~/path/to/groove-mcp/index.js -s user --env GROOVE_API_TOKEN=your_groove_api_token_here
```

## Available Tools

### Conversation Management

- **listConversations** - List conversations with optional filters

  - `status`: Filter by status (unread, opened, closed, snoozed)
  - `assigneeId`: Filter by assigned agent ID
  - `contactId`: Filter by contact ID
  - `tagIds`: Filter by tag IDs
  - `limit`: Maximum number of conversations to return (default: 20)

- **getConversation** - Get detailed information about a specific conversation

  - `id`: The conversation ID (required)

- **createConversation** - Create a new conversation

  - `contactId`: ID of the contact (required)
  - `subject`: Subject of the conversation (required)
  - `body`: Initial message body (required)
  - `assigneeId`: ID of agent to assign to
  - `tagIds`: Tag IDs to apply

- **updateConversation** - Update a conversation

  - `id`: The conversation ID (required)
  - `status`: New status (opened, closed, snoozed)
  - `assigneeId`: ID of agent to assign to
  - `tagIds`: Tag IDs to apply
  - `snoozedUntil`: ISO 8601 datetime to snooze until

- **closeConversation** - Close a conversation
  - `id`: The conversation ID to close (required)

### Message Operations

- **listMessages** - List messages in a conversation

  - `conversationId`: The conversation ID to list messages for (required)
  - `limit`: Maximum number of messages to return (default: 50)
  - `after`: Cursor for pagination

- **sendMessage** - Send a message in a conversation

  - `conversationId`: The conversation ID to send message to (required)
  - `body`: The message body content (required)
  - `attachmentIds`: IDs of attachments to include

- **createNote** - Create an internal note in a conversation
  - `conversationId`: The conversation ID to add note to (required)
  - `body`: The note content (required)

### Contact Management

- **listContacts** - List contacts with optional search

  - `search`: Search string to filter contacts
  - `limit`: Maximum number of contacts to return (default: 20)
  - `after`: Cursor for pagination

- **getContact** - Get detailed information about a specific contact

  - `id`: The contact ID (required)

- **createContact** - Create a new contact

  - `email`: Contact email address (required)
  - `firstName`: Contact first name
  - `lastName`: Contact last name
  - `company`: Contact company
  - `title`: Contact job title
  - `phone`: Contact phone number

- **updateContact** - Update contact information
  - `id`: The contact ID (required)
  - `email`: Contact email address
  - `firstName`: Contact first name
  - `lastName`: Contact last name
  - `company`: Contact company
  - `title`: Contact job title
  - `phone`: Contact phone number

### Agent Operations

- **listAgents** - List all agents in the organization

- **getAgent** - Get detailed information about a specific agent

  - `id`: The agent ID (required)

- **getAvailableAgents** - List all available agents

### Knowledge Base

- **searchKbArticles** - Search knowledge base articles
  - `query`: Search query (required)
  - `limit`: Maximum number of articles to return (default: 20)

## Resources

The server exposes Knowledge Base articles as MCP resources. These can be browsed and read by MCP clients.

- **Knowledge Base Articles** - Published KB articles are available as resources
  - Each article includes metadata like category, views, and helpful votes
  - Articles are returned in Markdown format when read

## Development

```bash
# Watch mode for development
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run typecheck
```

## Project Structure

```
├── src/
│   ├── index.ts           # Main server entry point
│   ├── groove-client.ts   # GraphQL client wrapper
│   ├── tools/             # MCP tool implementations
│   │   ├── conversations.ts
│   │   ├── messages.ts
│   │   ├── contacts.ts
│   │   └── agents.ts
│   ├── resources/         # MCP resource implementations
│   │   └── kb-articles.ts
│   ├── types/             # TypeScript type definitions
│   │   └── groove.ts
│   └── utils/             # Utility functions
│       └── graphql-queries.ts
├── tests/                 # Test files
├── docs/                  # Documentation
└── dist/                  # Compiled JavaScript files
```

## License

MIT
