import { Router } from "express";
import {
  createAgent,
  getAgentById,
  getAgentNameById,
  getAllAgents,
  processKnowledgebaseFiles,
  removeAgent,
  updateAgent,
} from "../controllers/agentController";

const router = Router();

router.post("/processKnowledgebaseFiles", processKnowledgebaseFiles);
router.post("/create", createAgent);
router.get("/getlist", getAllAgents);
router.get("/get/:id", getAgentById);
router.get("/getAgentNameById/:id", getAgentNameById);
router.put("/update/:id", updateAgent);
router.delete("/remove/:id", removeAgent);

export default router;
