import express from "express";
import {
  markAttendance,
  markBulkAttendance,
  getClassAttendance,
  getStudentAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceReport,
  getTodayAttendanceSummary,
  getClassesAttendanceStatus,
  getUnmarkedAttendanceAlerts
} from "../controllers/attendanceController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Mark attendance routes
router.post("/mark", markAttendance);                    // Mark single student attendance
router.post("/mark-bulk", markBulkAttendance);          // Mark multiple students attendance

// Get attendance routes
router.get("/class", getClassAttendance);               // Get class attendance for a date
router.get("/report", getAttendanceReport);             // Get monthly attendance report
router.get("/alerts/unmarked", getUnmarkedAttendanceAlerts); // Get unmarked attendance alerts (must be before /student route)


// Not - work for now
router.get("/today-summary", getTodayAttendanceSummary); // Get today's summary for dashboard
router.get("/student/:studentId", getStudentAttendance); // Get student attendance history
router.put("/:id", updateAttendance);                   // Update attendance record
router.delete("/:id", deleteAttendance);                // Delete attendance record

// Add this route
router.get("/classes-status", getClassesAttendanceStatus); // Get attendance status for all classes

export default router;

// import express from "express";
// import {
//   markAttendance,
//   markBulkAttendance,
//   getClassAttendance,
//   getStudentAttendance,
//   updateAttendance,
//   deleteAttendance,
//   getAttendanceReport,
//   getTodayAttendanceSummary,
//   getClassesAttendanceStatus
// } from "../controllers/attendanceController.js";
// import { protect } from "../middleware/authMiddleware.js";

// const router = express.Router();

// // All routes require authentication
// router.use(protect);

// // Mark attendance routes
// router.post("/mark", markAttendance);                    // Mark single student attendance
// router.post("/mark-bulk", markBulkAttendance);          // Mark multiple students attendance

// // Get attendance routes
// router.get("/class", getClassAttendance);               // Get class attendance for a date
// router.get("/report", getAttendanceReport);             // Get monthly attendance report


// // Not - work for now
// router.get("/today-summary", getTodayAttendanceSummary); // Get today's summary for dashboard
// router.get("/student/:studentId", getStudentAttendance); // Get student attendance history
// router.put("/:id", updateAttendance);                   // Update attendance record
// router.delete("/:id", deleteAttendance);                // Delete attendance record

// router.get("/classes-status", getClassesAttendanceStatus); // Get attendance status for all classes
// export default router;


