-- CreateTable
CREATE TABLE "Train" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "agentId" INTEGER NOT NULL,
    "messageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Train_pkey" PRIMARY KEY ("id")
);
