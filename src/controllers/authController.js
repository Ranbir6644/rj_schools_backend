import User from "../models/User.js";
import { hashPassword, comparePassword } from "../middleware/hashPassword.js";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import jwt from "jsonwebtoken";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

export const register = async (req, res) => {
  try {
    const { name, udise, ePunjabId, role } = req.body;

    const userExists = await User.findOne({ $or: [{ udise }, { ePunjabId }] });
    if (userExists) return res.status(400).json({ message: "User with this UDISE or ePunjab ID already exists" });

    // const hashed = await hashPassword(password);

    const user = await User.create({
      name,
      udise,
      ePunjabId,
      role,
    });

    res.status(201).json({ message: "User registered", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { udise, ePunjabId } = req.body;

    // const user = await User.findOne({ $or: [{ udise }, { ePunjabId }] });
    // if (!user) return res.status(404).json({ message: "User not found" });

    const user = await User.findOne({ udise, ePunjabId });
    if (!user) return res.status(404).json({ message: "Invalid UDISE or ePunjab ID" });
    // const isMatch = await comparePassword(password, user.password);
    // if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, role: user.role, udise: user.udise, ePunjabId: user.ePunjabId },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: "Refresh Token required" });

  try {
    const user = await User.findOne({ refreshToken: refreshToken });
    if (!user) return res.status(403).json({ message: "Invalid Refresh Token" });

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
      if (err) return res.status(403).json({ message: "Token expired" });

      const accessToken = generateAccessToken(user);
      res.json({ accessToken });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findOne({ refreshToken: token });
    if (!user) return res.status(403).json({ message: "Invalid Token" });

    user.refreshToken = null;
    await user.save();

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
