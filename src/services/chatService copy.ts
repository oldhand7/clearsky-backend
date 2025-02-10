import { createClient } from "redis";
import { PrismaClient } from "@prisma/client";
import { logger } from "../helpers/logger";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { get_embedding } from "./pineconeService";
import { ChatOpenAI } from "@langchain/openai";
import msgpack from "msgpack-lite";

// Initialize Redis Client
const redis = createClient({
    username: "default",
    password: "RbrZCqeVsf2Iq0WdtDQ3ZFccgdQzNIt7",
    socket: {
        host: "redis-18971.c277.us-east-1-3.ec2.redns.redis-cloud.com",
        port: 18971,
    },
});

// Initialize Prisma Client
const prisma = new PrismaClient();

// Redis Error Handling
redis.on("error", (err) => logger.error("Redis Client Error:", err));

// Connect Redis Client
(async () => {
    try {
        await redis.connect();
        logger.info("Connected to Redis Cloud");
    } catch (err) {
        logger.error("Redis Cloud Connection Error:", err);
    }
})();

class QuestionAnswerAgent {
    private static readonly HISTORY_KEY_PREFIX = "session_history";
    private static readonly SESSION_EXPIRY = 1800; // 30 minutes in seconds

    static async build_template(context = "", query = "") {
        return `You are an expert in answering questions. Use the following context to answer the question:\n\nContext: ${context}\n\nQuestion: ${query}\nAnswer:`;
    }

    private async logMessage(
        agentId: number,
        sessionId: string,
        sender: string,
        content: string,
    ) {
        await prisma.message.create({
            data: { agentId, sessionId, sender, content },
        });
    }

    private async getSessionHistory(sessionId: string): Promise<string[]> {
        const historyKey =
            `${QuestionAnswerAgent.HISTORY_KEY_PREFIX}:${sessionId}`;
        const start = Date.now();
        const history = await redis.lRange(historyKey, -2, -1); // Fetch last 2 entries
        const duration = Date.now() - start;
        logger.info(`Redis lRange query latency: ${duration} ms`);
        if (history.length > 0) {
            await redis.expire(historyKey, QuestionAnswerAgent.SESSION_EXPIRY);
        }
        return history;
    }

    private async addToSessionHistory(sessionId: string, entry: string) {
        const historyKey =
            `${QuestionAnswerAgent.HISTORY_KEY_PREFIX}:${sessionId}`;
        const start = Date.now();
        await redis.rPush(historyKey, entry);
        await redis.expire(historyKey, QuestionAnswerAgent.SESSION_EXPIRY);
        const duration = Date.now() - start;
        logger.info(`Redis update session history latency: ${duration} ms`);
    }

    private async getTrainDataByAgentId(agentId: number): Promise<string[]> {
        const cacheKey = `trainData:${agentId}`;
        const cachedTrainData = await redis.get(cacheKey);

        if (cachedTrainData) {
            logger.info("Cached training data found");
            return JSON.parse(cachedTrainData);
        }

        const start = Date.now();
        const trainData = await prisma.train.findMany({
            where: { agentId },
            select: { data: true },
            take: 2, // Fetch last 2 entries
        });
        const duration = Date.now() - start;
        logger.info(`Prisma query latency for training data: ${duration} ms`);

        const data = trainData.map((item) => item.data);
        await redis.set(cacheKey, JSON.stringify(data), { EX: 3600 }); // Cache for 1 hour
        return data;
    }

    async get_answer_stream(
        query: string,
        agentId: number,
        sessionId: string,
        onChunk: (chunk: string) => void,
    ): Promise<void> {
        logger.info(
            `Getting answer for prompt: ${query}, Session ID: ${sessionId}`,
        );

        // Pinecone initialization
        const pinecone = new PineconeClient();
        const index = pinecone.index("clearsky").namespace(`agent-${agentId}`);

        // Retrieve cached embedding if available
        const redisStart = Date.now();
        const cachedEmbedding = await redis.get(`embedding:${query}`);
        const redisDuration = Date.now() - redisStart;
        logger.info(`Redis get embedding latency: ${redisDuration} ms`);

        let res;
        if (cachedEmbedding) {
            res = msgpack.decode(Buffer.from(cachedEmbedding, "base64"));
            logger.info("Cached embedding found");
        } else {
            const embeddingStart = Date.now();
            res = await get_embedding(query);

            // Validate vector dimensions
            if (res.length !== 1024) {
                throw new Error(`Invalid vector dimension: ${res.length}`);
            }

            const embeddingDuration = Date.now() - embeddingStart;
            logger.info(
                `Embedding generation latency: ${embeddingDuration} ms`,
            );

            const redisSetStart = Date.now();
            await redis.set(
                `embedding:${query}`,
                Buffer.from(msgpack.encode(res)).toString("base64"),
                { EX: 3600 },
            );
            const redisSetDuration = Date.now() - redisSetStart;
            logger.info(`Redis set embedding latency: ${redisSetDuration} ms`);
        }

        // Run Pinecone query and Redis session retrieval in parallel
        const pineconeStart = Date.now();
        const pineconeQuery = index.query({
            topK: 1, // Fetch the top result only
            vector: res,
            includeMetadata: false, // Exclude metadata
        });
        const sessionHistoryPromise = this.getSessionHistory(sessionId);
        const trainDataPromise = this.getTrainDataByAgentId(agentId);

        const [queryResult, sessionHistory, trainData] = await Promise.all([
            pineconeQuery,
            sessionHistoryPromise,
            trainDataPromise,
        ]);

        const pineconeDuration = Date.now() - pineconeStart;
        logger.info(`Pinecone query latency: ${pineconeDuration} ms`);

        const contextChunks = queryResult.matches
            .map((
                match,
            ) => (match.metadata?.text ? match.metadata.text.toString() : ""))
            .filter((text) => text !== "");

        // Combine context efficiently
        const combinedContext = [
            ...trainData, // Use last 2 training data entries
            ...sessionHistory, // Use last 2 session history entries
            ...contextChunks.slice(0, 2), // Use top 2 Pinecone results
        ].join("\n");

        const prompt = await QuestionAnswerAgent.build_template(
            combinedContext,
            query,
        );

        // Initialize ChatOpenAI model
        const model = new ChatOpenAI({
            model: "gpt-3.5-turbo",
            streaming: true,
            maxTokens: 300,
        });

        // Stream the response
        const response = await model.stream(prompt);

        const startTime = Date.now();
        let firstChunkTime: number | null = null;

        for await (const chunk of response) {
            if (!firstChunkTime) {
                firstChunkTime = Date.now();
                logger.info(
                    `Time to first chunk: ${firstChunkTime - startTime} ms`,
                );
            }

            if (chunk?.content && typeof chunk.content === "string") {
                onChunk(chunk.content);
            }
        }

        const endTime = Date.now();
        logger.info(`Total response time: ${endTime - startTime} ms`);

        // Update session history and logs
        await this.addToSessionHistory(sessionId, `Question: ${query}`);
        await this.addToSessionHistory(
            sessionId,
            `Answer: [STREAMED_RESPONSE]`,
        );
        await this.logMessage(agentId, sessionId, "user", query);
        await this.logMessage(agentId, sessionId, "bot", "[STREAMED_RESPONSE]");
    }
}

export { QuestionAnswerAgent };
