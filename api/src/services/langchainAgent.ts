import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { awardSearchService } from './awardSearchService';
import { pineconeClient } from './pineconeClient';
import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * LangChain Agent with Tool Calling (using LangGraph)
 * 
 * The LLM decides when to:
 * 1. Search the knowledge base (for general award information)
 * 2. Use the web crawler (for specific event details, deadlines, locations)
 * 3. Answer directly (for simple questions)
 */
export class LangChainQAAgent {
  private agent: any;
  private model: ChatOpenAI;
  private tools: DynamicStructuredTool[];

  constructor() {
    // Initialize OpenAI model with function calling
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Define tools available to the agent
    this.tools = [
      this.createKnowledgeBaseSearchTool(),
      this.createWebCrawlerTool(),
    ];

    // Create the React agent using LangGraph with system message
    this.agent = createReactAgent({
      llm: this.model,
      tools: this.tools,
      messageModifier: this.getSystemPrompt(),
    });
  }

  /**
   * System prompt that guides the agent's behavior
   */
  private getSystemPrompt(): string {
    return `You are a helpful assistant for the Stevie Awards nomination system.

CORE RESPONSIBILITIES:
1. Answer questions about Stevie Awards programs, categories, deadlines, and processes
2. Help users find relevant information using available tools
3. Guide users toward finding the right award categories for their achievements

TOOL USAGE GUIDELINES:
- Use "search_knowledge_base" for general information about categories, eligibility, processes
- Use "search_web" for specific event details, deadlines, locations, recent winners
- Choose the most appropriate tool based on the question type

OUT-OF-CONTEXT QUESTIONS:
If a user asks something completely unrelated to Stevie Awards (e.g., weather, sports, cooking, general knowledge):
- Start with: "I'm having trouble answering that question as it's outside my area of expertise."
- Explain you're specifically designed for Stevie Awards
- Provide contact: help@stevieawards.com
- Redirect back to Stevie Awards topics

Example response:
"I'm having trouble answering that question as it's outside my area of expertise. I'm specifically designed to help with Stevie Awards information, categories, and nominations. For questions beyond this scope, please contact help@stevieawards.com for further assistance.

Is there anything about the Stevie Awards I can help you with?"

ANSWER FORMATTING:
When answering questions:
1. Provide clear, accurate information
2. Include relevant sources/citations when available
3. Keep answers concise but complete
4. Use a friendly, professional tone

GUIDING TO RECOMMENDATIONS:
After answering a question, naturally guide users toward the recommendation system:
- If they ask about categories: "Would you like me to help you find the right categories for your specific achievements?"
- If they ask about eligibility: "I can help you discover which award categories best match your qualifications. Would you like to explore personalized recommendations?"
- If they ask about deadlines: "Now that you know the deadline, would you like help identifying the best categories to enter?"
- If they ask general questions: "By the way, I can help you find award categories tailored to your specific achievements. Would you like to get personalized recommendations?"

Keep the call-to-action natural and conversational, not pushy.

CONTACT INFORMATION:
For questions you cannot answer or issues requiring human assistance:
- Email: help@stevieawards.com
- Always provide this when you're unable to help

Remember: Be helpful, accurate, and always guide users toward discovering the right award categories for their achievements.`;
  }

  /**
   * Tool: Search Knowledge Base
   */
  private createKnowledgeBaseSearchTool() {
    return new DynamicStructuredTool({
      name: 'search_knowledge_base',
      description: 'Search the Stevie Awards knowledge base for general information about categories, eligibility, processes, and award details. Use this for questions that don\'t require real-time web data.',
      schema: z.object({
        query: z.string().describe('The search query to find relevant information in the knowledge base'),
      }),
      func: async ({ query }) => {
        try {
          logger.info('langchain_tool_kb_search', { query });

          // Generate embedding for the query
          const embedding = await openaiService.generateEmbedding(query, 'text-embedding-ada-002');

          // Search Pinecone
          const results = await pineconeClient.query(embedding, 5, { content_type: 'kb_article' });

          if (results.length === 0) {
            return 'No relevant information found in the knowledge base. Consider using the web search tool for more specific or recent information.';
          }

          // Format results
          const formattedResults = results
            .map((r, idx) => {
              const title = r.metadata.title || 'Untitled';
              const content = r.metadata.chunk_text || '';
              const similarity = (r.score * 100).toFixed(1);
              return `[${idx + 1}] ${title} (${similarity}% match)\n${content.substring(0, 500)}...`;
            })
            .join('\n\n');

          return `Found ${results.length} relevant articles:\n\n${formattedResults}`;
        } catch (error: any) {
          logger.error('langchain_tool_kb_search_error', { error: error.message });
          return `Error searching knowledge base: ${error.message}`;
        }
      },
    });
  }

  /**
   * Tool: Web Search & Scrape
   * Now uses REAL web search (Tavily API) to find relevant pages across the internet
   */
  private createWebCrawlerTool() {
    return new DynamicStructuredTool({
      name: 'search_web',
      description: 'Search the ENTIRE WEB (not just stevieawards.com) for specific information like event locations, deadlines, recent winners, or current year details. This tool will search Google/Bing/etc to find relevant pages, then scrape and analyze them. Use this for time-sensitive or specific factual questions.',
      schema: z.object({
        query: z.string().describe('The search query to find information across the web (e.g., "where was Stevie Awards MENA 2025 held?", "American Business Awards 2026 deadline")'),
      }),
      func: async ({ query }) => {
        try {
          logger.info('langchain_tool_web_search', { query });

          // Import webSearchService dynamically to avoid circular dependencies
          const { webSearchService } = await import('./webSearchService');

          // Search the web and scrape top results
          const result = await webSearchService.searchAndScrape(query, {
            maxResults: 5,  // Find 5 relevant pages
            maxScrape: 3,   // Scrape top 3
          });

          // Format the response with all scraped content
          let response = '';

          // If Tavily provided a direct answer, include it
          if (result.answer) {
            response += `Quick Answer: ${result.answer}\n\n`;
          }

          // Add detailed information from scraped pages
          response += `Found ${result.searchResults.length} relevant pages. Here's what I found:\n\n`;

          result.scrapedContent.forEach((page, idx) => {
            response += `**Source ${idx + 1}: ${page.title}**\n`;
            response += `URL: ${page.url}\n`;
            // Include first 500 chars of content
            const preview = page.content.substring(0, 500).trim();
            response += `Content: ${preview}${page.content.length > 500 ? '...' : ''}\n\n`;
          });

          // Add links to other results
          if (result.searchResults.length > result.scrapedContent.length) {
            response += `\nOther relevant pages:\n`;
            result.searchResults.slice(result.scrapedContent.length).forEach((r, idx) => {
              response += `${idx + 1}. ${r.title}\n   ${r.url}\n`;
            });
          }

          logger.info('langchain_tool_web_search_success', {
            query,
            resultsFound: result.searchResults.length,
            pagesScraped: result.scrapedContent.length,
          });

          return response;
        } catch (error: any) {
          logger.error('langchain_tool_web_search_error', { error: error.message });
          return `Error searching web: ${error.message}. The web search service may be unavailable.`;
        }
      },
    });
  }

  /**
   * Process a user query using the LangGraph React agent
   */
  async query(input: string, chatHistory: Array<{ role: string; content: string }> = []): Promise<{
    answer: string;
    sources: Array<{ url: string; title: string; snippet: string }>;
  }> {
    try {
      logger.info('langchain_agent_query', { input, history_length: chatHistory.length });

      // Convert chat history to LangChain message format
      const messages = chatHistory.map(msg => {
        if (msg.role === 'user') {
          return { role: 'user', content: msg.content };
        } else {
          return { role: 'assistant', content: msg.content };
        }
      });

      // Invoke the agent with the input and chat history
      const result = await this.agent.invoke({
        messages: [
          ...messages,
          { role: 'user', content: input },
        ],
      });

      // Extract the final answer from the agent's response
      const lastMessage = result.messages[result.messages.length - 1];
      const answer = lastMessage.content || 'I apologize, but I couldn\'t generate a response. Please try rephrasing your question.';

      logger.info('langchain_agent_complete', { 
        output_length: answer.length,
        messages_count: result.messages.length,
      });

      return {
        answer,
        sources: [], // Sources are embedded in the answer by the tools
      };
    } catch (error: any) {
      logger.error('langchain_agent_error', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

// Export singleton instance
export const langchainAgent = new LangChainQAAgent();
