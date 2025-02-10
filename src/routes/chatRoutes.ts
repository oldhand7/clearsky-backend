import { Router } from "express";
import {
  getMessagesBySessionId,
  getReactionsByAgentId,
  handleIncomingMessage,
  updateReaction,
  trainModel,
  fetchTrainDataByAgentId,
  removeTrainById, // Import the new controller function
} from "../controllers/chatController";

const router = Router();

// Route to handle incoming messages
router.post("/message", handleIncomingMessage);
// Route to get messages by session ID with pagination
router.get("/messages/:sessionId", getMessagesBySessionId);
// Route to get reactions by agent ID
router.get("/reactions/:agentId", getReactionsByAgentId); 
// Route to update the reaction for a message
router.put("/messages/:id/reaction", updateReaction);
// Route to train the model
router.post("/train", trainModel);
// Route to fetch all train data by agentId
router.get("/train/:agentId", fetchTrainDataByAgentId);

// Route to remove a train entry by id
router.delete("/train/:id", removeTrainById);

export default router;
