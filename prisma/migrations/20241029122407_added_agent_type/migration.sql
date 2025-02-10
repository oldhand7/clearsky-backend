-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "agentType" "AgentType" NOT NULL DEFAULT 'TEXT';
