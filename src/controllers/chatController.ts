import { Request, Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { QuestionAnswerAgent } from "../services/chatService";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();
const questionAnswerAgent = new QuestionAnswerAgent();

export const handleIncomingMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { query, agentId, sessionId } = req.body;

  // Validate required fields
  if (!query || !agentId || !sessionId) {
    res.status(400).json({
      success: false,
      message: "Missing query, agentId, or sessionId.",
    });
    return;
  }

  try {
    // Validate agentId with Prisma
    const agent = await prisma.agent.findUnique({
      where: { id: parseInt(agentId, 10) },
    });

    if (!agent) {
      res.status(400).json({
        success: false,
        message: "Sorry, I couldn’t find what you’re looking for.",
      });
      return;
    }

    // Get response from QuestionAnswerAgent service
    const response = await questionAnswerAgent.get_answer(
      query,
      agentId,
      sessionId,
    );

    res.status(200).json({
      success: true,
      message: "Response successfully generated.",
      data: response,
    });
  } catch (error: any) {
    console.error("Error handling incoming message:", error.message);
    res.status(500).json({
      success: false,
      message: "An internal server error occurred. Please try again.",
    });
  }
};

/**
 * Get messages by session ID with pagination
 */
export const getMessagesBySessionId = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!sessionId) {
      res.status(400).json({ error: "Session ID is required" });
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Retrieve messages from the database in descending order by time (latest first)
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" }, // Order by descending time (latest first)
      skip: offset,
      take: limit,
    });

    // Get total count of messages for pagination metadata
    const totalMessages = await prisma.message.count({
      where: { sessionId },
    });

    // Reassign indices based on reverse order (newest = index 1)
    const reorderedMessages = messages.map((message, index) => ({
      ...message,
      index: totalMessages - (offset + index), // Assign index in reverse order
    }));

    res.json({
      messages: reorderedMessages.reverse(), // Reverse order to display newest first
      pagination: {
        totalMessages,
        currentPage: page,
        totalPages: Math.ceil(totalMessages / limit),
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getReactionsByAgentId = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { agentId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!agentId) {
      res.status(400).json({ error: "Agent ID is required" });
      return;
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Retrieve messages with unresolved issues (issue = 1) for the given agentId
    const messages = await prisma.message.findMany({
      where: {
        agentId: parseInt(agentId), // Ensure agentId is a number
        issue: 1, // Only unresolved issues
      },
      orderBy: { createdAt: "desc" }, // Order by descending time (latest first)
      skip: offset,
      take: limit,
    });

    // Get total count of unresolved issues for the given agentId
    const totalMessages = await prisma.message.count({
      where: {
        agentId: parseInt(agentId), // Ensure agentId is a number
        issue: 1, // Only unresolved issues
      },
    });

    res.json({
      messages,
      pagination: {
        totalMessages,
        currentPage: page,
        totalPages: Math.ceil(totalMessages / limit),
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching reactions by Agent ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Controller to update the reaction for a message
interface UpdateReactionRequest extends Request {
  params: {
    id: string;
  };
  body: {
    reaction: number | null;
  };
}

export const updateReaction = async (
  req: UpdateReactionRequest,
  res: Response,
): Promise<void> => {
  const messageId = parseInt(req.params.id); // Extract message ID from the URL
  const { reaction } = req.body; // Extract reaction from the request body

  // Validate input
  if (reaction !== 0 && reaction !== 1 && reaction !== null) {
    res.status(400).json({ error: "Reaction must be 0, 1, or null." });
    return;
  }

  try {
    // Initialize update data
    const updateData: { reaction: number | null; issue?: number | null } = {
      reaction,
    };

    // Update issue field based on reaction
    if (reaction === 0) {
      updateData.issue = 1; // Unresolved issue
    } else if (reaction === null) {
      updateData.issue = null; // No issue
    }

    // Update the message
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData,
    });

    // Respond with the updated message
    res.status(200).json({
      message: "Reaction updated successfully!",
      data: updatedMessage,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({
        error: "Failed to update reaction. Check the message ID and try again.",
      });
  }
};

export const trainModel = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { messageId, data, agentId } = req.body;

    if (!messageId || !data || !agentId) {
      res.status(400).json({
        error: "Missing required fields: messageId, data, or agentId",
      });
      return;
    }

    const parsedAgentId = parseInt(agentId, 10);
    if (isNaN(parsedAgentId)) {
      res.status(400).json({
        error: "Invalid agentId. It must be an integer.",
      });
      return;
    }

    const existingEntry = await prisma.train.findUnique({
      where: { id: messageId },
    });

    if (existingEntry) {
      res.status(400).json({
        error: "Training already exists for this messageId.",
      });
      return;
    }

    const newTrainEntry = await prisma.train.create({
      data: {
      messageId,
      data,
      agentId: parsedAgentId,
      createdAt: new Date(),
      },
    });

    await prisma.message.update({
      where: { id: messageId },
      data: { issue: 0 },
    });

    res.status(201).json({
      message: "Data successfully saved to Train model, and issue updated in Message model",
      data: newTrainEntry,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(404).json({
        error: "Message or train data not found.",
      });
      return;
    }

    res.status(500).json({
      error: "Failed to save data to Train model or update Message issue field.",
    });
  }
};

export const fetchTrainDataByAgentId = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { agentId } = req.params;

    const parsedAgentId = parseInt(agentId, 10);
    if (isNaN(parsedAgentId)) {
      res.status(400).json({
        error: "Invalid agentId. It must be an integer.",
      });
      return;
    }

    const trainData = await prisma.train.findMany({
      where: { agentId: parsedAgentId },
    });

    res.status(200).json({
      message: "Train data fetched successfully",
      data: trainData,
    });
  } catch (error) {
    console.error("Error fetching train data by agentId:", error);
    res.status(500).json({
      error: "Failed to fetch train data by agentId.",
    });
  }
};

// Remove a Train entry by its id
export const removeTrainById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate and parse id
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      res.status(400).json({
        error: "Invalid train id. It must be an integer.",
      });
      return;
    }

    // Attempt to delete the train entry by id
    const deletedTrain = await prisma.train.delete({
      where: { id: parsedId },
    });

    // Respond with the deleted entry
    res.status(200).json({
      message: "Train data deleted successfully",
      data: deletedTrain,
    });
  } catch (error) {
    console.error("Error deleting train data by id:", error);

    // Handle specific Prisma errors
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(404).json({
        error: "Train data not found with the given id.",
      });
      return;
    }

    // Handle server-side errors
    res.status(500).json({
      error: "Failed to delete train data.",
    });
  }
};
