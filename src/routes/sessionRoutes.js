import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { archiveSession } from "../controllers/sessionController.js";
const router = express.Router();

// Route to archive session

router.post('/archive', protect, archiveSession);

export default router;