// routes/uploadRoutes.js
import express from "express";
import {
  uploadStudentImages,
  deleteStudentImages,
  deleteStudentImageField,
  uploadTeacherImages,
  deleteTeacherImages,
  deleteTeacherImageField,
} from "../controllers/uploadController.js";
import { protect } from "../middleware/authMiddleware.js";
import { uploadMemory } from "../middleware/multerMemory.js";

const router = express.Router();

/* Student uploads */
router.post(
  "/student/:id",
  protect,
  uploadMemory.fields([
    { name: "studentImg", maxCount: 1 },
    { name: "fatherImg", maxCount: 1 },
    { name: "motherImg", maxCount: 1 },
    { name: "signature", maxCount: 1 },
  ]),
  uploadStudentImages
);

router.delete("/student/:id", protect, deleteStudentImages);
router.delete("/student/:id/:field", protect, deleteStudentImageField);

/* Teacher uploads */
router.post(
  "/teacher/:id",
  protect,
  uploadMemory.fields([
    { name: "photo", maxCount: 1 },
    { name: "resume", maxCount: 1 },
  ]),
  uploadTeacherImages
);

router.delete("/teacher/:id", protect, deleteTeacherImages);
router.delete("/teacher/:id/:field", protect, deleteTeacherImageField);

export default router;
