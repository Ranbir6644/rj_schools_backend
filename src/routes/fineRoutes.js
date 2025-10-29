import express from "express";
import {
  getClassFines,
  getStudentFineSummary,
  clearStudentFine,
  updateFineBalance,
  getFinePaymentHistory,
  syncFinesFromAttendance,
  getAllClassesFines
} from "../controllers/fineController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Fine management routes
router.get("/class/:classId", getClassFines); // Get fines for a class
router.get("/classes/all", getAllClassesFines); // Newly added on  10-29-2025 Get all classes fines list

router.get("/student/:studentId/summary", getStudentFineSummary); // Get student fine summary

router.post("/student/:studentId/clear", clearStudentFine); // Clear all fines for student
router.patch("/:fineId/payment", updateFineBalance); // Partial payment for fine
router.get("/:fineId/payment-history", getFinePaymentHistory); // Get payment history

// Utility routes
router.post("/sync", syncFinesFromAttendance); // Sync fines from attendance


export default router;

