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
} from "../controllers/holidayController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect); // ✅ all routes require auth

router.post("/", protect, createHoliday);           // Create holiday
router.get("/", protect, getAllHolidays);           // Get all holidays
router.get("/yearly", protect, getHolidaysByYear);  // ✅ Get holidays by year
router.get("/monthly", protect, getHolidaysByMonth);// ✅ Get holidays by month
router.get("/:id", protect, getHolidayById);        // Get holiday by ID
router.put("/:id", protect, updateHoliday);         // Update holiday
router.delete("/:id", protect, deleteHoliday);      // Delete holiday

router.post('/sundays', protect, markSundaysAsHolidays);


export default router;
