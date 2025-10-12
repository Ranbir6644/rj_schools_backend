// controllers/uploadController.js
import cloudinary from "../utils/cloudinaryConfig.js";
import { uploadFromBuffer } from "../utils/uploadToCloudinary.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

/* ---------- Helpers ---------- */
const MAX_FILE_SIZE = 5 * 1024 * 1024; // ✅ 5MB limit


const safeDestroy = async (publicId) => {
  try {
    if (publicId) await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("cloudinary destroy error", err?.message || err);
  }
};


const checkFileSize = (file, fieldName) => {
  if (file?.size > MAX_FILE_SIZE) {
    throw new Error(
      `${fieldName} is too large. Maximum size is ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB`
    );
  }
};

/* ---------- Student endpoints ---------- */
export const uploadStudentImages = async (req, res) => {
  try {
    const id = req.params.id;
    const student = await Student.findById(id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const files = req.files || {};

    // studentImg
    if (files.studentImg?.[0]) {
      checkFileSize(files.studentImg[0], "Student image");
      await safeDestroy(student.studentImgPublicId);
      const r = await uploadFromBuffer(files.studentImg[0].buffer, "students");
      student.studentImg = r.secure_url;
      student.studentImgPublicId = r.public_id;
    }

    // fatherImg
    if (files.fatherImg?.[0]) {
      checkFileSize(files.fatherImg[0], "Father image");
      await safeDestroy(student.fatherImgPublicId);
      const r = await uploadFromBuffer(files.fatherImg[0].buffer, "students/fathers");
      student.fatherImg = r.secure_url;
      student.fatherImgPublicId = r.public_id;
    }

    // motherImg
    if (files.motherImg?.[0]) {
      checkFileSize(files.fatherImg[0], "Mother image");
      await safeDestroy(student.motherImgPublicId);
      const r = await uploadFromBuffer(files.motherImg[0].buffer, "students/mothers");
      student.motherImg = r.secure_url;
      student.motherImgPublicId = r.public_id;
    }

    // signature
    if (files.signature?.[0]) {
      checkFileSize(files.signature[0], "Signature");
      await safeDestroy(student.signaturePublicId);
      const r = await uploadFromBuffer(files.signature[0].buffer, "students/signatures");
      student.signature = r.secure_url;
      student.signaturePublicId = r.public_id;
    }

    await student.save();
    res.json({ message: "Student images updated", student });
  } catch (err) {
    console.error(err);

    // ✅ Cloudinary-specific error (fallback)
    if (err.message?.includes("File size too large")) {
      return res.status(400).json({ message: "Image too large. Please upload a file below 10MB." });
    }

    // ✅ Our custom size error
    if (err.message?.includes("too large")) {
      return res.status(400).json({ message: err.message });
    }

    res.status(500).json({ message: "Student image upload failed", error: err.message });
  }
};

export const deleteStudentImages = async (req, res) => {
  try {
    const id = req.params.id;
    const student = await Student.findById(id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    await safeDestroy(student.studentImgPublicId);
    await safeDestroy(student.fatherImgPublicId);
    await safeDestroy(student.motherImgPublicId);
    await safeDestroy(student.signaturePublicId);

    // clear fields
    student.studentImg = undefined;
    student.studentImgPublicId = undefined;
    student.fatherImg = undefined;
    student.fatherImgPublicId = undefined;
    student.motherImg = undefined;
    student.motherImgPublicId = undefined;
    student.signature = undefined;
    student.signaturePublicId = undefined;

    await student.save();
    res.json({ message: "Student images deleted", student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete student images", error: err.message });
  }
};

export const deleteStudentImageField = async (req, res) => {
  // delete specific image field, e.g. /api/uploads/student/:id/studentImg
  try {
    const { id, field } = req.params;
    const student = await Student.findById(id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const allowed = {
      studentImg: "studentImgPublicId",
      fatherImg: "fatherImgPublicId",
      motherImg: "motherImgPublicId",
      signature: "signaturePublicId",
    };

    if (!allowed[field]) return res.status(400).json({ message: "Invalid field" });

    const publicIdKey = allowed[field];
    await safeDestroy(student[publicIdKey]);
    student[field] = undefined;
    student[publicIdKey] = undefined;
    await student.save();
    res.json({ message: `${field} deleted`, student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete field", error: err.message });
  }
};

/* ---------- Teacher endpoints ---------- */
export const uploadTeacherImages = async (req, res) => {
  try {
    const id = req.params.id;
    const teacher = await Teacher.findById(id);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const files = req.files || {};

    if (files.photo?.[0]) {
      checkFileSize(files.photo[0], "Teacher photo");
      await safeDestroy(teacher.photoPublicId);
      const r = await uploadFromBuffer(files.photo[0].buffer, "teachers/photo");
      teacher.photo = r.secure_url;
      teacher.photoPublicId = r.public_id;
    }

    if (files.resume?.[0]) {
      checkFileSize(files.resume[0], "Teacher resume");
      await safeDestroy(teacher.resumePublicId);
      const r = await uploadFromBuffer(files.resume[0].buffer, "teachers/resume");
      teacher.resume = r.secure_url;
      teacher.resumePublicId = r.public_id;
    }

    await teacher.save();
    res.json({ message: "Teacher images updated", teacher });
  } catch (err) {
    console.error(err);

    if (err.message?.includes("too large")) {
      return res.status(400).json({ message: err.message });
    }
    if (err.message?.includes("File size too large")) {
      return res.status(400).json({ message: "Image too large. Please upload below 10MB." });
    }

    res.status(500).json({ message: "Teacher image upload failed", error: err.message });
  }
};

export const deleteTeacherImages = async (req, res) => {
  try {
    const id = req.params.id;
    const teacher = await Teacher.findById(id);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    await safeDestroy(teacher.photoPublicId);
    await safeDestroy(teacher.resumePublicId);

    teacher.photo = undefined;
    teacher.photoPublicId = undefined;
    teacher.resume = undefined;
    teacher.resumePublicId = undefined;

    await teacher.save();
    res.json({ message: "Teacher images deleted", teacher });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete teacher images", error: err.message });
  }
};

export const deleteTeacherImageField = async (req, res) => {
  try {
    const { id, field } = req.params;
    const teacher = await Teacher.findById(id);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const allowed = {
      photo: "photoPublicId",
      resume: "resumePublicId",
    };

    if (!allowed[field]) return res.status(400).json({ message: "Invalid field" });

    const publicIdKey = allowed[field];
    await safeDestroy(teacher[publicIdKey]);
    teacher[field] = undefined;
    teacher[publicIdKey] = undefined;
    await teacher.save();
    res.json({ message: `${field} deleted`, teacher });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete field", error: err.message });
  }
};
