import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import cloudinary from "../utils/cloudinaryConfig.js";
import { uploadFromBuffer } from "../utils/uploadToCloudinary.js";
import mongoose from "mongoose";

// Create Teacher Profile with Transaction
export const createTeacher = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let userId = req.body.userId;
    let user = null;

    // If userId is not provided but user details are present, create a new user
    if (!userId && req.body.name && req.body.udise && req.body.ePunjabId) {
      const { name, udise, ePunjabId } = req.body;

      // Check if user with this udise already exists
      const existingUser = await User.findOne({ $or: [{ udise }, { ePunjabId }] }).session(session);

      if (existingUser) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "User with this udise already exists" });
      }

      // Hash the password
      // const hashedPassword = await hashPassword(password);

      // Create new user
      user = new User({
        name,
        udise,
        ePunjabId,
        role: 'teacher'
      });

      const savedUser = await user.save({ session });
      userId = savedUser._id;
      user = savedUser;
    }

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Either userId or user details (name, udise, ePunjabId) are required"
      });
    }

    // Check if teacher profile already exists for this userId
    const existingTeacher = await Teacher.findOne({ userId }).session(session);
    if (existingTeacher) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Teacher profile already exists for this user"
      });
    }

    // Create teacher profile
    const teacherData = {
      ...req.body,
      userId
    };

    // Remove user-specific fields
    delete teacherData.udise;
    delete teacherData.ePunjabId;
    delete teacherData.name;
    delete teacherData.role;

    const teacher = new Teacher(teacherData);
    const savedTeacher = await teacher.save({ session });

    // Handle image uploads if files are provided
    const files = req.files || {};
    let imageUpdates = {};

    try {
      // Upload photo
      if (files.photo?.[0]) {
        const result = await uploadFromBuffer(files.photo[0].buffer, "teachers/photo");
        imageUpdates.photo = result.secure_url;
        imageUpdates.photoPublicId = result.public_id;
      }

      // Upload resume
      if (files.resume?.[0]) {
        const result = await uploadFromBuffer(files.resume[0].buffer, "teachers/resume");
        imageUpdates.resume = result.secure_url;
        imageUpdates.resumePublicId = result.public_id;
      }

      // Update teacher with image data if any images were uploaded
      if (Object.keys(imageUpdates).length > 0) {
        await Teacher.findByIdAndUpdate(
          savedTeacher._id,
          imageUpdates,
          { session }
        );
      }

    } catch (imageError) {
      // If image upload fails, roll back everything
      await session.abortTransaction();
      session.endSession();

      // Clean up any uploaded images
      if (imageUpdates.photoPublicId) {
        await cloudinary.uploader.destroy(imageUpdates.photoPublicId);
      }
      if (imageUpdates.resumePublicId) {
        await cloudinary.uploader.destroy(imageUpdates.resumePublicId);
      }

      return res.status(400).json({
        message: "Image upload failed",
        error: imageError.message
      });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // If user was created in this request, fetch it
    if (!user) {
      user = await User.findById(userId);
    }

    const responseData = {
      _id: savedTeacher._id,
      name: user.name,
      udise: user.udise,
      ePunjabId: user.ePunjabId,
      role: user.role,
      ...savedTeacher.toObject(),
      ...imageUpdates, // Include image URLs
      userId: user._id
    };

    res.status(201).json(responseData);

  } catch (err) {
    // If any error occurs, abort the transaction
    await session.abortTransaction();
    session.endSession();

    res.status(400).json({
      message: err.message,
      details: "Transaction rolled back - no user or teacher was created"
    });
  }
};

// Get All Teachers
export const getTeachers = async (req, res) => {
  try {
    // Get all users with role 'teacher'
    const User = (await import("../models/User.js")).default;
    const users = await User.find({ role: "teacher" });
    const userIds = users.map(u => u._id);

    // Get all teacher profiles for those users
    const teachers = await Teacher.find({ userId: { $in: userIds } });
    // Map userId to teacher profile
    const teacherMap = new Map();
    teachers.forEach(t => teacherMap.set(t.userId.toString(), t));
    // Merge user and teacher data into single objects
    const result = users.map(user => {
      const teacher = teacherMap.get(user._id.toString());
      return {
        _id: user._id,
        name: user.name,
        udise: user.udise,
        ePunjabId: user.ePunjabId,
        role: user.role,
        ...(teacher ? teacher.toObject() : {}), // spread teacher properties if exists
        userId: user._id // maintain reference to user
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Teacher by ID
export const getTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id).populate("userId", "name udise ePunjabId role");
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });
    res.json(teacher);
  } catch (err) {
    console.log(err);

    res.status(500).json({ message: err.message });
  }
};

// Update Teacher
export const updateTeacher = async (req, res) => {
  try {
    const { name, udise, ePunjabId, role } = req.body;

    if (name || udise || ePunjabId || role) {
      const teacher = await Teacher.findById(req.params.id);
      if (!teacher) return res.status(404).json({ message: "Teacher not found" });

      const user = await User.findById(teacher.userId);
      if (!user) return res.status(404).json({ message: "Associated user not found" });

      if (name) user.name = name;
      if (udise) user.udise = udise;
      if (ePunjabId) user.ePunjabId = ePunjabId;
      if (role) user.role = role;

      await user.save();
    }
    const teacher = await Teacher.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const user = await User.findById(teacher.userId);
    const teacherData = {
      _id: user._id,
      name: user.name,
      udise: user.udise,
      ePunjabId: user.ePunjabId,
      role: user.role,
      ...teacher.toObject(),
      userId: user._id
    };

    res.json(teacherData);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Delete Teacher
export const deleteTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });


    if (teacher.photoPublicId) await cloudinary.uploader.destroy(teacher.photoPublicId);
    if (teacher.resumePublicId) await cloudinary.uploader.destroy(teacher.resumePublicId);

    // Delete the user
    const user = await User.findByIdAndDelete(teacher.userId);
    if (!user) return res.status(404).json({ message: "Associated user not found" });

    // Delete the teacher profile
    await Teacher.findByIdAndDelete(req.params.id);

    res.json({ message: "Teacher and associated user account deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
