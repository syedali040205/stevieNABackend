/**
 * QA Agent using OpenAI Function Calling (Native)
 * 
 * Replaces LangChain to avoid 1,556 type definition files that cause OOM during compilation
 * 
 * The LLM decides when to:
 * 1. Search the knowledge base (for general award information)
 * 2. Use web search (for specific event details, deadlines, locations)
 * 3. Answer directly (for simple questions)
 */

import OpenAI from 'openai';
import { awardSearchService } from './awardSearchService';
import { pineconeClient } from './pineconeClient';
import { openaiService } from './openaiService';
import { webSearchService } from './webSearchService';
import { jinaReader } from './crawler/jinaReader';
import logger from '../utils/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define tools for function calling
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search the Stevie Awards knowledge base for general information about categories, eligibility, processes, and award programs. Use this for questions about award types, category descriptions, general eligibility criteria, and nomination processes.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant information in the knowledge base',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_stevie_website',
      description: 'Search and scrape the official Stevie Awards website (stevieawards.com) for specific event information, locations, dates, judging criteria, entry procedures. Use this for questions about specific events like SAWIB, MENA, SATE, or how to enter.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find information on stevieawards.com',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the entire web for current information about Stevie Awards from various sources. Use this as a fallback when stevieawards.com might not have the information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find current information on the web',
          },
        },
        required: ['query'],
      },
    },
  },
];

const systemPrompt = `You are a helpful assistant for the Stevie Awards nomination system.

CORE RESPONSIBILITIES:
1. Answer questions about Stevie Awards programs, categories, deadlines, and processes
2. Help users find relevant information using available tools
3. Guide users toward finding the right award categories for their achievements

TOOL USAGE GUIDELINES:
- Use "search_knowledge_base" for general information about categories, eligibility, processes
- Use "search_stevie_website" for specific event details (locations, dates, judging criteria, how to enter)
- Use "search_web" as a fallback when other tools don't have the information
- Prefer search_stevie_website over search_web for Stevie Awards specific queries

CITATION REQUIREMENTS:
- ALWAYS include source URLs at the end of your answer
- Format: "Sources: [URL1], [URL2], [URL3]"
- Use the URLs from the tool results
- If multiple sources, list all of them

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
2. Include relevant sources/citations at the end
3. Keep answers concise but complete
4. Use a friendly, professional tone

GUIDING TO RECOMMENDATIONS:
After answering a question, naturally guide users toward personalized recommendations:
- "Would you like me to help you find the right categories for your specific achievements?"
- "I can provide personalized category recommendations based on your organization's accomplishments. Would that be helpful?"
- "Based on what you're looking for, I can suggest specific award categories that might be a good fit. Interested?"

Keep the transition natural and conversational, not pushy.`;

export class QAAgent {
  /**
   * Process a user query with function calling
   */
  async query(userQuery: string, conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []): Promise<string> {
    logger.info('qa_agent_query_start', { query: userQuery });

    try {
      // Build messages array
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: userQuery },
      ];

      // Initial API call
      let response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3,
      });

      let iterations = 0;
      const maxIterations = 5;

      // Handle function calls in a loop
      while (response.choices[0].message.tool_calls && iterations < maxIterations) {
        iterations++;
        const toolCalls = response.choices[0].message.tool_calls;

        logger.info('qa_agent_tool_calls', {
          iteration: iterations,
          toolCount: toolCalls.length,
          tools: toolCalls.map(tc => tc.function.name),
        });

        // Add assistant message with tool calls
        messages.push(response.choices[0].message);

        // Execute each tool call
        for (const toolCall of toolCalls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          logger.info('qa_agent_executing_tool', {
            tool: functionName,
            args: functionArgs,
          });

          let functionResult: string;

          try {
            if (functionName === 'search_knowledge_base') {
              functionResult = await this.searchKnowledgeBase(functionArgs.query);
            } else if (functionName === 'search_stevie_website') {
              functionResult = await this.searchStevieWebsite(functionArgs.query);
            } else if (functionName === 'search_web') {
              functionResult = await this.searchWeb(functionArgs.query);
            } else {
              functionResult = JSON.stringify({ error: 'Unknown function' });
            }
          } catch (error: any) {
            logger.error('qa_agent_tool_error', {
              tool: functionName,
              error: error.message,
            });
            functionResult = JSON.stringify({ error: error.message });
          }

          // Add function result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: functionResult,
          });
        }

        // Get next response
        response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          tools,
          tool_choice: 'auto',
          temperature: 0.3,
        });
      }

      const finalAnswer = response.choices[0].message.content || 'I apologize, but I was unable to generate a response.';

      logger.info('qa_agent_query_complete', {
        query: userQuery,
        iterations,
        answerLength: finalAnswer.length,
      });

      return finalAnswer;
    } catch (error: any) {
      logger.error('qa_agent_query_error', {
        query: userQuery,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Search knowledge base tool implementation
   */
  private async searchKnowledgeBase(query: string): Promise<string> {
    try {
      // Generate embedding for the query
      const embedding = await openaiService.generateEmbedding(query);

      // Search Pinecone
      const results = await pineconeClient.query(embedding, 5);

      if (!results || results.length === 0) {
        return JSON.stringify({
          success: false,
          message: 'No relevant information found in knowledge base',
        });
      }

      // Format results
      const formattedResults = results.map((match: any) => ({
        content: match.metadata?.text || match.metadata?.content || '',
        score: match.score,
        source: match.metadata?.source || 'Knowledge Base',
      }));

      return JSON.stringify({
        success: true,
        results: formattedResults,
      });
    } catch (error: any) {
      logger.error('search_knowledge_base_error', { error: error.message });
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Search Stevie Awards website tool implementation
   */
  private async searchStevieWebsite(query: string): Promise<string> {
    try {
      // Use Tavily to search specifically on stevieawards.com
      const searchResults = await webSearchService.search(`site:stevieawards.com ${query}`, {
        maxResults: 5,
      });

      if (!searchResults.results || searchResults.results.length === 0) {
        return JSON.stringify({
          success: false,
          message: 'No relevant information found on stevieawards.com',
        });
      }

      // Scrape the top results
      const urlsToScrape = searchResults.results.slice(0, 3).map(r => r.url);
      const scrapedResults = await jinaReader.scrapeMultiple(urlsToScrape);

      const formattedResults = scrapedResults.map(result => ({
        title: result.title,
        url: result.url,
        content: result.content.substring(0, 2000),
      }));

      return JSON.stringify({
        success: true,
        results: formattedResults,
        answer: searchResults.answer,
      });
    } catch (error: any) {
      logger.error('search_stevie_website_error', { error: error.message });
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Web search tool implementation
   */
  private async searchWeb(query: string): Promise<string> {
    try {
      // Search web and scrape top results
      const searchResults = await webSearchService.searchAndScrape(query, {
        maxResults: 5,
        maxScrape: 3,
      });

      if (!searchResults.scrapedContent || searchResults.scrapedContent.length === 0) {
        return JSON.stringify({
          success: false,
          message: 'No relevant web results found',
        });
      }

      // Format results
      const formattedResults = searchResults.scrapedContent.map(result => ({
        title: result.title,
        url: result.url,
        content: result.content.substring(0, 2000), // Limit content length
      }));

      return JSON.stringify({
        success: true,
        results: formattedResults,
        answer: searchResults.answer,
      });
    } catch (error: any) {
      logger.error('search_web_error', { error: error.message });
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  }
}

export const qaAgent = new QAAgent();
