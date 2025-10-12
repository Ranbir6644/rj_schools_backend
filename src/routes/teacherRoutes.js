import express from "express";
import {
  createTeacher,
  getTeachers,
  getTeacher,
  updateTeacher,
  deleteTeacher,
} from "../controllers/teacherController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadMemory } from "../middleware/multerMemory.js";

const router = express.Router();

// router.post("/", protect, createTeacher);    // Create profile
router.post("/", protect, uploadMemory.fields([
  { name: "photo", maxCount: 1 },
  { name: "resume", maxCount: 1 },
]),
  createTeacher
);   
router.get("/", protect, getTeachers);       // Get all teachers
router.get("/:id", protect, getTeacher);     // Get single teacher
router.put("/:id", protect, updateTeacher);  // Update teacher
router.delete("/:id", protect, deleteTeacher); // Delete teacher

export default router;
