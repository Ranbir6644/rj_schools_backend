import Student from "../models/Student.js";
import User from "../models/User.js";
import cloudinary from "../utils/cloudinaryConfig.js";
import { uploadFromBuffer } from "../utils/uploadToCloudinary.js";
import Class from "../models/Class.js"; // ✅ Add this import

import mongoose from "mongoose";
import mysql from "mysql2/promise";

// ✅ Create Student with Transaction (safe rollback on error)
export const createStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let userId = req.body.userId;
    let user = null;

    // ✅ 1. If no userId provided, create new user
    if (!userId && req.body.name && req.body.udise && req.body.ePunjabId) {
      const { name, udise, ePunjabId } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ $or: [{ udise }, { ePunjabId }] }).session(session);

      if (existingUser) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "User with this udise already exists" });
      }

      // Create user
      user = new User({
        name,
        udise,
        ePunjabId,
        role: "student",
      });

      const savedUser = await user.save({ session });
      userId = savedUser._id;
      user = savedUser;
    }

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Either userId or user details (name, udise, ePunjabId) are required",
      });
    }

    // ✅ 2. Check if student profile already exists
    const existingStudent = await Student.findOne({ userId }).session(session);
    if (existingStudent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Student profile already exists for this user",
      });
    }

    // ✅ 3. Create student profile
    const studentData = {
      ...req.body,
      userId,
    };

    // Remove user-specific fields
    delete studentData.udise;
    delete studentData.ePunjabId;
    delete studentData.name;
    delete studentData.role;

    const student = new Student(studentData);
    const savedStudent = await student.save({ session });

    // ✅ 4. Handle image uploads
    const files = req.files || {};
    let imageUpdates = {};

    try {
      if (files.studentImg?.[0]) {
        const result = await uploadFromBuffer(files.studentImg[0].buffer, "students");
        imageUpdates.studentImg = result.secure_url;
        imageUpdates.studentImgPublicId = result.public_id;
      }

      if (files.fatherImg?.[0]) {
        const result = await uploadFromBuffer(files.fatherImg[0].buffer, "students/fathers");
        imageUpdates.fatherImg = result.secure_url;
        imageUpdates.fatherImgPublicId = result.public_id;
      }

      if (files.motherImg?.[0]) {
        const result = await uploadFromBuffer(files.motherImg[0].buffer, "students/mothers");
        imageUpdates.motherImg = result.secure_url;
        imageUpdates.motherImgPublicId = result.public_id;
      }

      if (files.signature?.[0]) {
        const result = await uploadFromBuffer(files.signature[0].buffer, "students/signatures");
        imageUpdates.signature = result.secure_url;
        imageUpdates.signaturePublicId = result.public_id;
      }

      // ✅ Update student with uploaded image URLs
      if (Object.keys(imageUpdates).length > 0) {
        await Student.findByIdAndUpdate(savedStudent._id, imageUpdates, { session });
      }
    } catch (imageError) {
      // ❌ Image upload failed — rollback everything
      await session.abortTransaction();
      session.endSession();

      // Cleanup uploaded files
      if (imageUpdates.studentImgPublicId) await cloudinary.uploader.destroy(imageUpdates.studentImgPublicId);
      if (imageUpdates.fatherImgPublicId) await cloudinary.uploader.destroy(imageUpdates.fatherImgPublicId);
      if (imageUpdates.motherImgPublicId) await cloudinary.uploader.destroy(imageUpdates.motherImgPublicId);
      if (imageUpdates.signaturePublicId) await cloudinary.uploader.destroy(imageUpdates.signaturePublicId);

      return res.status(400).json({
        message: "Image upload failed",
        error: imageError.message,
      });
    }

    // ✅ 5. Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // ✅ 6. Ensure user is fetched if it was already existing
    if (!user) {
      user = await User.findById(userId);
    }

    // ✅ 7. Return combined response
    const responseData = {
      _id: savedStudent._id,
      name: user.name,
      udise: user.udise,
      ePunjabId: user.ePunjabId,
      role: user.role,
      ...savedStudent.toObject(),
      ...imageUpdates,
      userId: user._id,
    };

    res.status(201).json(responseData);
  } catch (err) {
    // ❌ Rollback on any other error
    await session.abortTransaction();
    session.endSession();

    res.status(400).json({
      message: err.message,
      details: "Transaction rolled back - no user or student was created",
    });
  }
};


// ✅ Get all students
export const getAllStudents = async (req, res) => {
  try {
    // Get all users with role 'student'
    const users = await User.find({ role: "student" });
    const userIds = users.map(u => u._id);

    // Get all student profiles for those users
    const students = await Student.find({ userId: { $in: userIds } }).populate('classId', 'name section');

    // Map userId to student profile
    const studentMap = new Map();
    students.forEach(t => studentMap.set(t.userId.toString(), t));

    // Merge user and student data into single objects
    const result = users.map(user => {
      const student = studentMap.get(user._id.toString());
      return {
        _id: student ? student._id : user._id,
        name: user.name,
        udise: user.udise,
        ePunjabId: user.ePunjabId,
        role: user.role,
        ...(student ? student.toObject() : {}), // spread student properties if exists
        userId: user._id // maintain reference to user
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Get students by classId
export const getStudentsByClassId = async (req, res) => {
  try {
    const { classId } = req.params;

    if (!classId) {
      return res.status(400).json({ message: "Class ID is required" });
    }

    // ✅ 1. Get all users with role 'student'
    const users = await User.find({ role: "student" });
    const userIds = users.map(u => u._id);

    // ✅ 2. Find all students of this class
    const students = await Student.find({
      userId: { $in: userIds },
      classId: classId,
    })
      .populate("userId", "name udise ePunjabId role")
      .populate("classId", "name section");

    if (!students.length) {
      return res.status(404).json({ message: "No students found for this class" });
    }

    // ✅ 3. Format response
    const formattedStudents = students.map(student => ({
      _id: student._id,
      name: student.userId.name,
      udise: student.userId.udise,
      ePunjabId: student.userId.ePunjabId,
      role: student.userId.role,
      ...student.toObject(),
      userId: student.userId._id,
    }));

    res.status(200).json(formattedStudents);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch students by class", error: err.message });
  }
};

// ✅ Get student by ID
export const getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate("userId", "name udise ePunjabId role")
      .populate("classId", "name section");

    if (!student) return res.status(404).json({ message: "Student not found" });

    // Format response to match other endpoints
    const responseData = {
      _id: student._id,
      name: student.userId.name,
      udise: student.userId.udise,
      ePunjabId: student.userId.ePunjabId,
      role: student.userId.role,
      ...student.toObject(),
      userId: student.userId._id
    };

    res.json(responseData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Update student
export const updateStudent = async (req, res) => {
  try {
    const { name, udise, ePunjabId, role } = req.body;

    if (name || udise || ePunjabId || role) {
      const student = await Student.findById(req.params.id);
      if (!student) return res.status(404).json({ message: "Student not found" });

      const user = await User.findById(student.userId);
      if (!user) return res.status(404).json({ message: "Associated user not found" });

      if (name) user.name = name;
      if (udise) user.udise = udise;
      if (ePunjabId) user.ePunjabId = ePunjabId;
      if (role) user.role = role;
      await user.save();
    }
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const user = await User.findById(student.userId);
    const studentData = {
      _id: user._id,
      name: user.name,
      udise: user.udise,
      ePunjabId: user.ePunjabId,
      role: user.role,
      ...student.toObject(),
      userId: user._id
    };

    res.json(studentData);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ✅ Delete student
export const deleteStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    // delete cloudinary images if any
    if (student.studentImgPublicId) await cloudinary.uploader.destroy(student.studentImgPublicId);
    if (student.fatherImgPublicId) await cloudinary.uploader.destroy(student.fatherImgPublicId);
    if (student.motherImgPublicId) await cloudinary.uploader.destroy(student.motherImgPublicId);
    if (student.signaturePublicId) await cloudinary.uploader.destroy(student.signaturePublicId);


    // Delete the user
    const user = await User.findByIdAndDelete(student.userId);
    if (!user) return res.status(404).json({ message: "Associated user not found" });

    // Delete the student profile
    await Student.findByIdAndDelete(req.params.id);

    res.json({ message: "Student and associated user account deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// export const migrateStudent = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { Raadhar_no } = req.body;

//     if (!Raadhar_no) {
//       return res.status(400).json({ message: "Raadhar_no is required" });
//     }

//     // Connect to MySQL
//     const mysqlConn = await mysql.createConnection({
//       host: process.env.MYSQL_HOST,
//       user: process.env.MYSQL_USER,
//       password: process.env.MYSQL_PASSWORD,
//       database: process.env.MYSQL_DB,
//     });

//     console.log("🔍 Searching for student with Raadhar_no:", Raadhar_no);

//     // Fetch student from MySQL
//     const [rows] = await mysqlConn.execute(
//       "SELECT * FROM registration_tbl WHERE Raadhar_no = ?",
//       [Raadhar_no]
//     );

//     await mysqlConn.end();

//     if (rows.length === 0) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ message: "No student found with this Raadhar number" });
//     }

//     const student = rows[0];
//     console.log("✅ Found student:", student.Rname);

//     // Debug: Check what image data we have
//     console.log("🖼️ Image fields in MySQL:", {
//       studentImg: student.Rstudent_img ? `Exists (${student.Rstudent_img.length} chars)` : 'Empty',
//       fatherImg: student.Rfather_img ? `Exists (${student.Rfather_img.length} chars)` : 'Empty',
//       motherImg: student.Rmother_img ? `Exists (${student.Rmother_img.length} chars)` : 'Empty',
//       signature: student.Rsignature ? `Exists (${student.Rsignature.length} chars)` : 'Empty'
//     });

//     // ✅ 1. Check if user already exists
//     const existingUser = await User.findOne({
//       $or: [
//         ...(student.UDISE_NO ? [{ udise: student.UDISE_NO }] : []),
//         ...(student.Re_punjab_id ? [{ ePunjabId: student.Re_punjab_id }] : [])
//       ]
//     }).session(session);

//     const existingStudent = await Student.findOne({ aadharNo: student.Raadhar_no }).session(session);

//     if (existingUser || existingStudent) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({
//         message: "User or Student already exists",
//         existingUserId: existingUser?._id,
//         existingStudentId: existingStudent?._id
//       });
//     }

//     // ✅ 2. Create User document
//     const newUser = new User({
//       name: student.Rname,
//       udise: student.UDISE_NO || "TEMP_UDISE",
//       ePunjabId: student.Re_punjab_id,
//       role: "student",
//     });

//     const savedUser = await newUser.save({ session });
//     console.log("✅ User created:", savedUser._id);

//     // ✅ 3. Create StudentDetails document WITHOUT images initially
//     const studentData = {
//       userId: savedUser._id,
//       admissionDate: student.Radmission_date ? new Date(student.Radmission_date) : null,
//       aadharNo: student.Raadhar_no,
//       dob: student.Rdob ? new Date(student.Rdob) : null,
//       gender: student.Rgender,
//       category: student.Rcategory,
//       fatherName: student.Rfather_name,
//       motherName: student.Rmother_name,
//       fatherOccupation: student.Rfather_occ,
//       motherOccupation: student.Rmother_occ,
//       fatherIncome: typeof student.Rfather_inc === 'number' ? student.Rfather_inc : 0,
//       motherIncome: typeof student.Rmother_inc === 'number' ? student.Rmother_inc : 0,
//       fatherMobile: student.Rfather_mob,
//       motherMobile: student.Rmother_mob,
//       fatherAadharNo: student.Rfather_aadhar_no,
//       motherAadharNo: student.Rmother_aadhar_no,
//       sibling1: student.Rsibling1,
//       sibling2: student.Rsibling2,
//       sibling3: student.Rsibling3,
//       address: student.Raddress,
//       pickup1: student.Rpickup1,
//       pickup1_relationship: student.Rrelationship1,
//       pickup1_Aadhar: student.Raadhar_no1,
//       pickup1_mobile: student.Rcell_phone1,
//       pickup2: student.Rpickup2,
//       pickup2_relationship: student.Rrelationship2,
//       pickup2_Aadhar: student.Raadhar_no2,
//       pickup2_mobile: student.Rcell_phone2,
//       other_pickup: student.Rother_pickup,
//       impInfo1: student.Rimp_info1,
//       impInfo2: student.Rimp_info2,
//       impInfo3: student.Rimp_info3,
//       impInfo4: student.Rimp_info4,
//       status: student.Rstatus === 0 ? "inactive" : "active",
//     };

//     const studentDetails = new Student(studentData);
//     const savedStudent = await studentDetails.save({ session });

//     // ✅ 4. Commit the transaction first (data migration complete)
//     await session.commitTransaction();
//     session.endSession();

//     console.log("✅ Student data migration completed successfully!");

//     // ✅ 5. NOW MIGRATE IMAGES (outside transaction since it's slower and uses external services)
//     let imageMigrationResults = {};
//     try {
//       console.log("🔄 Starting image migration to Cloudinary...");

//       // Migrate student image
//       if (student.Rstudent_img && student.Rstudent_img.trim() !== '') {
//         console.log("📸 Migrating student image...");
//         const result = await migrateMySQLImageToCloudinary(
//           student.Rstudent_img,
//           'students',
//           savedStudent._id,
//           'studentImg'
//         );
//         imageMigrationResults.studentImg = result;
//       }

//       // Migrate father image
//       if (student.Rfather_img && student.Rfather_img.trim() !== '') {
//         console.log("📸 Migrating father image...");
//         const result = await migrateMySQLImageToCloudinary(
//           student.Rfather_img,
//           'students/fathers',
//           savedStudent._id,
//           'fatherImg'
//         );
//         imageMigrationResults.fatherImg = result;
//       }

//       // Migrate mother image
//       if (student.Rmother_img && student.Rmother_img.trim() !== '') {
//         console.log("📸 Migrating mother image...");
//         const result = await migrateMySQLImageToCloudinary(
//           student.Rmother_img,
//           'students/mothers',
//           savedStudent._id,
//           'motherImg'
//         );
//         imageMigrationResults.motherImg = result;
//       }

//       // Migrate signature
//       if (student.Rsignature && student.Rsignature.trim() !== '') {
//         console.log("📸 Migrating signature...");
//         const result = await migrateMySQLImageToCloudinary(
//           student.Rsignature,
//           'students/signatures',
//           savedStudent._id,
//           'signature'
//         );
//         imageMigrationResults.signature = result;
//       }

//       console.log("✅ Image migration completed:", imageMigrationResults);
//     } catch (imageError) {
//       console.error("⚠️ Image migration failed, but student data was saved:", imageError);
//       imageMigrationResults.error = imageError.message;
//     }

//     // ✅ 6. Get the updated student with images
//     const updatedStudent = await Student.findById(savedStudent._id)
//       .populate("userId", "name udise ePunjabId role")
//       .populate("classId", "name section");

//     // ✅ 7. Return combined response
//     const responseData = {
//       _id: updatedStudent._id,
//       name: updatedStudent.userId.name,
//       udise: updatedStudent.userId.udise,
//       ePunjabId: updatedStudent.userId.ePunjabId,
//       role: updatedStudent.userId.role,
//       ...updatedStudent.toObject(),
//       userId: updatedStudent.userId._id,
//       migration: {
//         source: "MySQL",
//         Raadhar_no: Raadhar_no,
//         timestamp: new Date(),
//         imagesMigrated: Object.keys(imageMigrationResults).filter(key =>
//           key !== 'error' && imageMigrationResults[key]?.success
//         ).length,
//         imageResults: imageMigrationResults
//       }
//     };

//     res.status(201).json({
//       message: "Student migrated successfully from MySQL to MongoDB",
//       data: responseData
//     });

//   } catch (err) {
//     // ❌ Rollback on any error
//     await session.abortTransaction();
//     session.endSession();

//     console.error("❌ Migration error:", err);

//     res.status(500).json({
//       message: "Migration failed",
//       error: err.message,
//       details: "Transaction rolled back - no data was saved"
//     });
//   }
// };


// export const previewMySQLStudent = async (req, res) => {
//   try {
//     const { Raadhar_no } = req.body;

//     if (!Raadhar_no) {
//       return res.status(400).json({ message: "Raadhar_no is required" });
//     }

//     // Connect to MySQL
//     const mysqlConn = await mysql.createConnection({
//       host: process.env.MYSQL_HOST,
//       user: process.env.MYSQL_USER,
//       password: process.env.MYSQL_PASSWORD,
//       database: process.env.MYSQL_DB,
//     });

//     // Fetch student from MySQL
//     const [rows] = await mysqlConn.execute(
//       "SELECT * FROM registration_tbl WHERE Raadhar_no = ?",
//       [Raadhar_no]
//     );

//     await mysqlConn.end();

//     if (rows.length === 0) {
//       return res.status(404).json({ message: "No student found with this Raadhar number" });
//     }

//     const student = rows[0];

//     // Check image types and sizes
//     const analyzeImage = (imageData) => {
//       if (!imageData || imageData.trim() === '') {
//         return { exists: false, type: 'none' };
//       }

//       if (imageData.startsWith('data:')) {
//         return { 
//           exists: true, 
//           type: 'base64', 
//           size: `${(imageData.length / 1024).toFixed(2)} KB` 
//         };
//       } else if (imageData.startsWith('http')) {
//         return { 
//           exists: true, 
//           type: 'url', 
//           source: imageData 
//         };
//       } else {
//         return { 
//           exists: true, 
//           type: 'file_path', 
//           source: imageData 
//         };
//       }
//     };

//     const previewData = {
//       mysqlData: {
//         name: student.Rname,
//         udise: student.UDISE_NO,
//         ePunjabId: student.Re_punjab_id,
//         aadharNo: student.Raadhar_no,
//         dob: student.Rdob,
//         gender: student.Rgender,
//         fatherName: student.Rfather_name,
//         motherName: student.Rmother_name,
//       },
//       images: {
//         studentImg: analyzeImage(student.Rstudent_img),
//         fatherImg: analyzeImage(student.Rfather_img),
//         motherImg: analyzeImage(student.Rmother_img),
//         signature: analyzeImage(student.Rsignature)
//       },
//       migrationStatus: "not_migrated" // This will be determined by your existing logic
//     };

//     res.json(previewData);

//   } catch (err) {
//     console.error("❌ Preview error:", err);
//     res.status(500).json({
//       message: "Failed to fetch MySQL student data",
//       error: err.message
//     });
//   }
// };



export const migrateStudent = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { Raadhar_no } = req.body;

    if (!Raadhar_no) {
      return res.status(400).json({ message: "Raadhar_no is required" });
    }

    // Connect to MySQL
    const mysqlConn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DB,
    });

    console.log("🔍 Searching for student with Raadhar_no:", Raadhar_no);

    // Fetch student from MySQL
    const [rows] = await mysqlConn.execute(
      "SELECT * FROM registration_tbl WHERE Raadhar_no = ?",
      [Raadhar_no]
    );

    await mysqlConn.end();

    if (rows.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "No student found with this Raadhar number" });
    }

    const student = rows[0];
    console.log("✅ Found student:", student.Rname);

    // ✅ 1. Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        ...(student.UDISE_NO ? [{ udise: student.UDISE_NO }] : []),
        ...(student.Re_punjab_id ? [{ ePunjabId: student.Re_punjab_id }] : [])
      ]
    }).session(session);

    const existingStudent = await Student.findOne({ aadharNo: student.Raadhar_no }).session(session);

    if (existingUser || existingStudent) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "User or Student already exists",
        existingUserId: existingUser?._id,
        existingStudentId: existingStudent?._id
      });
    }

    // ✅ 2. Handle Class Mapping - Find or Create Class
    let classId = null;
    if (student.Rclass) {
      // Try to find existing class by name
      const existingClass = await Class.findOne({
        name: student.Rclass
      }).session(session);

      if (existingClass) {
        classId = existingClass._id;
        console.log("✅ Found existing class:", student.Rclass);
      } else {
        // Create a new class if not found
        const newClass = new Class({
          name: student.Rclass,
          section: "Default", // You might want to adjust this
          // Add other required class fields here
        });
        const savedClass = await newClass.save({ session });
        classId = savedClass._id;
        console.log("✅ Created new class:", student.Rclass);
      }
    }


    const generateUdiseFromAadhar = (aadharNo) => {
      if (!aadharNo) {
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `TEMP_${timestamp}${random}`;
      }

      // Use last 8 digits of Aadhar + timestamp for uniqueness
      const aadharDigits = aadharNo.replace(/\D/g, '').slice(-8);
      const timestamp = Date.now().toString().slice(-4);
      return `TEMP_${aadharDigits}${timestamp}`;
    };

    // ✅ 3. Create User document
    let udiseValue = student.UDISE_NO;
    if (!udiseValue || udiseValue.trim() === '') {
      udiseValue = generateUdiseFromAadhar(student.Raadhar_no);
      console.log("🔧 Generated UDISE from Aadhar:", udiseValue);
    }


    // ✅ 3. Create User document
    const newUser = new User({
      name: student.Rname,
      // udise: student.UDISE_NO || "TEMP_UDISE",
      udise: udiseValue,
      ePunjabId: student.Re_punjab_id,
      role: "student",
    });

    const savedUser = await newUser.save({ session });
    console.log("✅ User created:", savedUser._id);

    // ✅ 4. Create StudentDetails document
    const studentData = {
      userId: savedUser._id,
      admissionDate: student.Radmission_date ? new Date(student.Radmission_date) : null,
      aadharNo: student.Raadhar_no,
      dob: student.Rdob ? new Date(student.Rdob) : null,
      gender: student.Rgender,
      category: student.Rcategory,
      fatherName: student.Rfather_name,
      motherName: student.Rmother_name,
      fatherOccupation: student.Rfather_occ,
      motherOccupation: student.Rmother_occ,
      fatherIncome: typeof student.Rfather_inc === 'number' ? student.Rfather_inc : 0,
      motherIncome: typeof student.Rmother_inc === 'number' ? student.Rmother_inc : 0,
      fatherMobile: student.Rfather_mob,
      motherMobile: student.Rmother_mob,
      fatherAadharNo: student.Rfather_aadhar_no,
      motherAadharNo: student.Rmother_aadhar_no,
      sibling1: student.Rsibling1,
      sibling2: student.Rsibling2,
      sibling3: student.Rsibling3,
      address: student.Raddress,
      pickup1: student.Rpickup1,
      pickup1_relationship: student.Rrelationship1,
      pickup1_Aadhar: student.Raadhar_no1,
      pickup1_mobile: student.Rcell_phone1,
      pickup2: student.Rpickup2,
      pickup2_relationship: student.Rrelationship2,
      pickup2_Aadhar: student.Raadhar_no2,
      pickup2_mobile: student.Rcell_phone2,
      other_pickup: student.Rother_pickup,
      impInfo1: student.Rimp_info1,
      impInfo2: student.Rimp_info2,
      impInfo3: student.Rimp_info3,
      impInfo4: student.Rimp_info4,
      studentImg: student.Rstudent_img,
      fatherImg: student.Rfather_img,
      motherImg: student.Rmother_img,
      signature: student.Rsignature,
      status: student.Rstatus === 0 ? "inactive" : "active",
    };

    // Only add classId if we found/created one
    if (classId) {
      studentData.classId = classId;
    }

    const studentDetails = new Student(studentData);
    const savedStudent = await studentDetails.save({ session });

    // ✅ 5. Commit the transaction
    await session.commitTransaction();
    session.endSession();

    console.log("✅ Student migration completed successfully!");

    // ✅ 6. Return combined response
    const responseData = {
      _id: savedStudent._id,
      name: savedUser.name,
      udise: savedUser.udise,
      ePunjabId: savedUser.ePunjabId,
      role: savedUser.role,
      ...savedStudent.toObject(),
      userId: savedUser._id,
      migration: {
        source: "MySQL",
        Raadhar_no: Raadhar_no,
        timestamp: new Date()
      }
    };

    res.status(201).json({
      message: "Student migrated successfully from MySQL to MongoDB",
      data: responseData
    });

  } catch (err) {
    // ❌ Rollback on any error
    await session.abortTransaction();
    session.endSession();

    console.error("❌ Migration error:", err);

    res.status(500).json({
      message: "Migration failed",
      error: err.message,
      details: "Transaction rolled back - no data was saved"
    });
  }
};

export const previewMySQLStudent = async (req, res) => {
  try {
    const { Raadhar_no } = req.body;

    if (!Raadhar_no) {
      return res.status(400).json({ message: "Raadhar_no is required" });
    }

    // Connect to MySQL
    const mysqlConn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DB,
    });

    // Fetch student from MySQL
    const [rows] = await mysqlConn.execute(
      "SELECT * FROM registration_tbl WHERE Raadhar_no = ?",
      [Raadhar_no]
    );

    await mysqlConn.end();

    if (rows.length === 0) {
      return res.status(404).json({ message: "No student found with this Raadhar number" });
    }

    const student = rows[0];

    // Check if already migrated by User (udise or ePunjabId) or by Student (aadharNo)
    const existingUser = await User.findOne({
      $or: [
        ...(student.UDISE_NO ? [{ udise: student.UDISE_NO }] : []),
        ...(student.Re_punjab_id ? [{ ePunjabId: student.Re_punjab_id }] : [])
      ]
    });

    const existingStudent = await Student.findOne({ aadharNo: student.Raadhar_no });

    const migrationStatus = (existingUser || existingStudent) ? "already_migrated" : "not_migrated";

    const previewData = {
      mysqlData: {
        name: student.Rname,
        udise: student.UDISE_NO,
        ePunjabId: student.Re_punjab_id,
        aadharNo: student.Raadhar_no,
        dob: student.Rdob,
        gender: student.Rgender,
        fatherName: student.Rfather_name,
        motherName: student.Rmother_name,
        class: student.Rclass,
        admissionDate: student.Radmission_date ? new Date(student.Radmission_date) : null,
        category: student.Rcategory,
        fatherOccupation: student.Rfather_occ,
        motherOccupation: student.Rmother_occ,
        fatherIncome: student.Rfather_inc,
        motherIncome: student.Rmother_inc,
        fatherMobile: student.Rfather_mob,
        motherMobile: student.Rmother_mob,
        fatherAadharNo: student.Rfather_aadhar_no,
        motherAadharNo: student.Rmother_aadhar_no,
        sibling1: student.Rsibling1,
        sibling2: student.Rsibling2,
        sibling3: student.Rsibling3,
        address: student.Raddress,
        pickup1: student.Rpickup1,
        pickup1_relationship: student.Rrelationship1,
        pickup1_Aadhar: student.Raadhar_no1,
        pickup1_mobile: student.Rcell_phone1,
        pickup2: student.Rpickup2,
        pickup2_relationship: student.Rrelationship2,
        pickup2_Aadhar: student.Raadhar_no2,
        pickup2_mobile: student.Rcell_phone2,
        other_pickup: student.Rother_pickup,
        impInfo1: student.Rimp_info1,
        impInfo2: student.Rimp_info2,
        impInfo3: student.Rimp_info3,
        impInfo4: student.Rimp_info4,
        studentImg: student.Rstudent_img ? 'Exists' : 'Not Provided',
        fatherImg: student.Rfather_img ? 'Exists' : 'Not Provided',
        motherImg: student.Rmother_img ? 'Exists' : 'Not Provided',
        signature: student.Rsignature ? 'Exists' : 'Not Provided',

        // Add other important fields you want to preview
      },
      migrationStatus,
      existingUserId: existingUser?._id,
      existingStudentId: existingStudent?._id
    };

    res.json(previewData);

  } catch (err) {
    console.error("❌ Preview error:", err);
    res.status(500).json({
      message: "Failed to fetch MySQL student data",
      error: err.message
    });
  }
};