import express from "express";
import { getUsers, getUser, updateUser, deleteUser } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All these routes require authentication
router.get("/", protect, getUsers);         // GET all users
router.get("/:id", protect, getUser);       // GET single user
router.put("/:id", protect, updateUser);    // UPDATE user
router.delete("/:id", protect, deleteUser); // DELETE user

export default router;
