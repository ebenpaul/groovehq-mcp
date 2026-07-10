import { GrooveClient } from '../groove-client.js';
import { queries } from '../utils/graphql-queries.js';
import { KnowledgeBaseArticle, KnowledgeBaseCategory } from '../types/groove.js';

interface ListKbArticlesArgs {
  categoryId?: string;
  published?: boolean;
  featured?: boolean;
  limit?: number;
  after?: string;
}

interface SearchKbArticlesArgs {
  query: string;
  limit?: number;
  after?: string;
}

export class KnowledgeBaseResources {
  constructor(private client: GrooveClient) {}

  async listArticles(args: ListKbArticlesArgs = {}): Promise<KnowledgeBaseArticle[]> {
    const variables = {
      categoryId: args.categoryId,
      published: args.published,
      featured: args.featured,
      first: args.limit || 20,
      after: args.after,
    };

    const response = await this.client.request<{
      knowledgeBaseArticles: {
        edges: Array<{ node: KnowledgeBaseArticle }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string;
        };
      };
    }>(queries.listKbArticles, variables);

    return response.knowledgeBaseArticles.edges.map(edge => edge.node);
  }

  async getArticle(id: string): Promise<KnowledgeBaseArticle | null> {
    const response = await this.client.request<{
      knowledgeBaseArticle: KnowledgeBaseArticle | null;
    }>(queries.getKbArticle, { id });

    return response.knowledgeBaseArticle;
  }

  async listCategories(): Promise<KnowledgeBaseCategory[]> {
    const response = await this.client.request<{
      knowledgeBaseCategories: KnowledgeBaseCategory[];
    }>(queries.listKbCategories);

    return response.knowledgeBaseCategories;
  }

  async searchArticles(args: SearchKbArticlesArgs): Promise<KnowledgeBaseArticle[]> {
    const variables = {
      query: args.query,
      first: args.limit || 20,
      after: args.after,
    };

    const response = await this.client.request<{
      searchKnowledgeBaseArticles: {
        edges: Array<{ node: KnowledgeBaseArticle }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string;
        };
      };
    }>(queries.searchKbArticles, variables);

    return response.searchKnowledgeBaseArticles.edges.map(edge => edge.node);
  }

  // Helper method to build resource URIs
  buildResourceUri(type: 'article' | 'category', id: string): string {
    return `groove://kb/${type}/${id}`;
  }

  // Format article for MCP resource
  formatArticleResource(article: KnowledgeBaseArticle) {
    return {
      uri: this.buildResourceUri('article', article.id),
      name: article.title,
      description: article.bodyPlainText?.substring(0, 200) + '...' || '',
      mimeType: 'text/markdown',
      metadata: {
        category: article.category?.name,
        views: article.views,
        helpful: article.helpfulVotes,
        published: article.published,
        featured: article.featured,
      },
    };
  }
}