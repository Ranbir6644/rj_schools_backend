import express from "express";
import {
  getDashboardSummary,
  getAttendanceGraphData,
  getGenderDistribution,
  getAllClasses,
  getCompleteDashboard,
  getDailyAttendanceGraphData
} from "../controllers/dashboardController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Dashboard routes
router.get("/summary", getDashboardSummary);                    // Top 4 cards data
router.get("/attendance-graph", getAttendanceGraphData);       // Graph data with filters
router.get("/daily-attendance", getDailyAttendanceGraphData);  //Newly added on 29-10-2025 Daily graph data - Datewise

router.get("/gender-distribution", getGenderDistribution);     // Pie chart data
router.get("/classes", getAllClasses);                         // All classes for dropdown
router.get("/complete", getCompleteDashboard);                 // All dashboard data in one call


export default router;
