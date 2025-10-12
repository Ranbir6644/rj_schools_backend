import express from "express";
import {
  createStudent,
  getAllStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  getStudentsByClassId,
  previewMySQLStudent,
  migrateStudent,
  // uploadStudentImage,
} from "../controllers/studentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadMemory } from "../middleware/multerMemory.js";

const router = express.Router();

router.post("/", protect, uploadMemory.fields([
  { name: "studentImg", maxCount: 1 },
  { name: "fatherImg", maxCount: 1 },
  { name: "motherImg", maxCount: 1 },
  { name: "signature", maxCount: 1 },
]),
  createStudent
);               // Create student
router.get("/", protect, getAllStudents);          // Get all students
router.get("/class/:classId", protect, getStudentsByClassId);
router.get("/:id", protect, getStudentById);        // Get single student   
router.put("/:id", protect, updateStudent);         // Update student
router.delete("/:id", protect, deleteStudent);      // Delete student


// ✅ Migration Routes
router.post("/migrate/preview", protect, previewMySQLStudent); // Preview before migration
router.post("/migrate", protect, migrateStudent);

export default router;
