import express from "express";
import {
  createHoliday,
  getAllHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
  getHolidaysByYear,
  getHolidaysByMonth,
  markSundaysAsHolidays,
  markBulkDaysHolidays,
} from "../controllers/holidayController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect); // ✅ all routes require auth

router.post("/", createHoliday);           // Create holiday
router.get("/", getAllHolidays);           // Get all holidays
router.get("/yearly", getHolidaysByYear);  // ✅ Get holidays by year
router.get("/monthly", getHolidaysByMonth);// ✅ Get holidays by month
router.get("/:id", getHolidayById);        // Get holiday by ID
router.put("/:id", updateHoliday);         // Update holiday
router.delete("/:id", deleteHoliday);      // Delete holiday

router.post('/sundays', protect, markSundaysAsHolidays);
router.post('/bulk', markBulkDaysHolidays);            // ✅ Mark bulk date range as holidays

export default router;

