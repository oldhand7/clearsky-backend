import { createClient } from "redis";
import { logger } from "../helpers/logger";

// Initialize Redis Client
const redis = createClient({
    username: "default",
    password: "RbrZCqeVsf2Iq0WdtDQ3ZFccgdQzNIt7",
    socket: {
        host: "redis-18971.c277.us-east-1-3.ec2.redns.redis-cloud.com",
        port: 18971,
    },
});

// Handle Redis errors
redis.on("error", (err) => logger.error("Redis Client Error:", err));

// Singleton Redis connection
async function connectRedis() {
    if (!redis.isOpen) {
        try {
            await redis.connect();
            logger.info("Connected to Redis Cloud");
        } catch (err) {
            logger.error("Redis Cloud Connection Error:", err);
            throw err;
        }
    }
    return redis;
}

export { redis, connectRedis };
