import { PrismaClient } from "@prisma/client";
import { ChatOpenAI } from "@langchain/openai";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { logger } from "../helpers/logger";
import { get_embedding } from "./pineconeService";
import { createClient } from 'redis';

// Initialize Redis Cloud client and Prisma client
const redis = createClient({
    username: 'default', // Redis Cloud typically uses 'default' for the username
    password: 'a1IR91No9FV9iZMlS93GYXh3JXvW2JM7', // Replace with your Redis Cloud password
    socket: {
        host: 'redis-17578.c16.us-east-1-2.ec2.redns.redis-cloud.com',
        port: 17578 // Replace with your Redis Cloud port (e.g., 18971)
    }
});

const prisma = new PrismaClient();

redis.on('error', (err) => logger.error('Redis Client Error:', err));

// Ensure Redis connection is established
(async () => {
    try {
        await redis.connect();
        logger.info('Connected to Redis Cloud');
    } catch (err) {
        logger.error('Redis Cloud Connection Error:', err);
    }
})();

class QuestionAnswerAgent {
    private static readonly HISTORY_KEY_PREFIX = "session_history";
    private static readonly SESSION_EXPIRY = 1800; // 30 minutes in seconds

    constructor() {}

    static async build_template(context = "", query = "") {
        const prompt =
            `You are an expert in state of the union topics. You are provided multiple context items that are related to the prompt you have to answer. Use the following pieces of context to answer the question at the end.\n\nContext: ${context} \n\n\n\nQuestion: ${query}\nAnswer: `;
        return prompt;
    }

    // Log messages to PostgreSQL
    private async logMessage(
        agentId: number,
        sessionId: string,
        sender: string,
        content: string,
    ) {
        await prisma.message.create({
            data: {
                agentId,
                sessionId,
                sender,
                content,
            },
        });
    }

    // Fetch session-specific history from Redis
    private async getSessionHistory(sessionId: string): Promise<string[]> {
        const historyKey =
            `${QuestionAnswerAgent.HISTORY_KEY_PREFIX}:${sessionId}`;
        const history = await redis.lRange(historyKey, 0, -1); // Redis Cloud client uses `lRange`

        // If the session exists, refresh its expiry time
        if (history.length > 0) {
            await redis.expire(historyKey, QuestionAnswerAgent.SESSION_EXPIRY);
        }
        return history;
    }

    // Add new messages to session-specific history in Redis
    private async addToSessionHistory(sessionId: string, entry: string) {
        const historyKey =
            `${QuestionAnswerAgent.HISTORY_KEY_PREFIX}:${sessionId}`;

        // Add the new entry to the session history
        await redis.rPush(historyKey, entry); // Redis Cloud client uses `rPush`

        // Set or refresh the expiry time (30 minutes)
        await redis.expire(historyKey, QuestionAnswerAgent.SESSION_EXPIRY);

        // Trim history to the last 10 entries
        await redis.lTrim(historyKey, -10, -1); // Redis Cloud client uses `lTrim`
    }

    // Fetch train data by agent ID
    private async getTrainDataByAgentId(agentId: number): Promise<string[]> {
        const trainData = await prisma.train.findMany({
            where: {
                agentId: agentId,
            },
            select: {
                data: true,
            },
        });
        return trainData.map((item) => item.data);
    }

    async construct_llm_payload(
        query: string,
        contextChunks: string[],
        sessionHistory: string[],
        trainData: string[],
    ) {
        const combinedContext = [...trainData, ...sessionHistory, ...contextChunks].join(
            "\n",
        );
        const prompt = await QuestionAnswerAgent.build_template(
            combinedContext,
            query,
        );
        return prompt;
    }

    async get_answer(query: string, agentId: number, sessionId: string) {
        logger.info(
            `Getting answer for prompt: ${query}, Session ID: ${sessionId}`,
        );

        const pinecone = new PineconeClient();
        const index = pinecone.index("clearsky").namespace(`agent-${agentId}`);

        // Generate embedding for the query
        const res = await get_embedding(query);
        logger.info(`Query Embedding Length ${res.length}`);

        // Query Pinecone for relevant chunks
        const query_result = await index.query({
            topK: 4,
            vector: res,
            includeMetadata: true,
            includeValues: true,
        });

        // Extract context chunks safely
        const contextChunks: string[] = query_result.matches
            .map((match) =>
                match.metadata?.text && typeof match.metadata.text === "string"
                    ? match.metadata.text
                    : "",
            )
            .filter((text) => text !== "");

        // Retrieve session-specific history
        const sessionHistory = await this.getSessionHistory(sessionId);

        // Retrieve train data for the agent
        const trainData = await this.getTrainDataByAgentId(agentId);

        // Construct LLM payload
        const prompt = await this.construct_llm_payload(
            query,
            contextChunks,
            sessionHistory,
            trainData,
        );

        // Invoke the model
        const model = new ChatOpenAI({
            model: "gpt-4o-mini",
            streaming: true,
            maxTokens:100,
        });

        const result = await model.invoke(prompt);

        // Handle chunked or complex result
        let botResponse: string;

        // If result is an array of chunks
        if (Array.isArray(result)) {
            botResponse = result
                .map((chunk) => (chunk.content ? chunk.content.toString() : ""))
                .join(" ");
        } else if (
            result && typeof result === "object" && "content" in result
        ) {
            // If result is an object with a 'content' property
            botResponse = result.content.toString();
        } else {
            throw new Error("Unexpected response format from model.invoke");
        }

        // Add to session history
        await this.addToSessionHistory(sessionId, `Question: ${query}`);
        await this.addToSessionHistory(sessionId, `Answer: ${botResponse}`);

        // Log messages to PostgreSQL
        await this.logMessage(agentId, sessionId, "user", query);
        await this.logMessage(agentId, sessionId, "bot", botResponse);

        console.log(botResponse);
        return botResponse;
    }
}

export { QuestionAnswerAgent };
