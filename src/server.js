import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import classRoutes from "./routes/classRoutes.js"
import studentRoutes from "./routes/studentRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import holidayRoutes from "./routes/holidayRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import fineRoutes from './routes/fineRoutes.js';
import dashboardRoutes from "./routes/dashboardRoutes.js"

dotenv.config();
const app = express();

// Middleware
app.use(express.json());

// CORS configuration - Update for production
const allowedOrigins = [
  "http://localhost:5173", 
  // "https://your-frontend-domain.onrender.com" 
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/holidays", holidayRoutes);
app.use('/api/fines', fineRoutes);
app.use("/api/dashboard", dashboardRoutes); 
app.use("/api/uploads", uploadRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ message: "Server is running!" });
});

// MongoDB connection - Updated without deprecated options
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
