import express from "express";
import { register, login, refresh, logout } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);   // Register user
router.post("/login", login);         // Login + get tokens
router.post("/refresh", refresh);     // Refresh Access Token
router.post("/logout", logout);       // Logout (invalidate refresh token)
export default router;
