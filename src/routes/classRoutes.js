import express from "express";
import {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deleteClass,
} from "../controllers/classController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createClass);       // Create Class
router.get("/", protect, getClasses);         // Get All
router.get("/:id", protect, getClassById);    // Get by ID
router.put("/:id", protect, updateClass);     // Update
router.delete("/:id", protect, deleteClass);  // Delete

export default router;
