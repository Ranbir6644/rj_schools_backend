import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import User from "../models/User.js";
import Fine from "../models/Fine.js"; // Import Fine model

// ✅ Create fine for absent student (moved here to avoid circular dependency)
const createFineForAbsent = async (attendanceId, studentId, classId, date) => {
  try {
    // Check if fine already exists
    const existingFine = await Fine.findOne({ attendanceId });
    if (existingFine) {
      return existingFine;
    }

    // Create new fine
    const fine = new Fine({
      studentId,
      classId,
      attendanceId,
      date: new Date(date),
      fineAmount: 50, // Rs.50 per absent day
      paidAmount: 0,
      pendingAmount: 50,
      status: "pending",
      remarks: "Fine for absent day"
    });

    return await fine.save();
  } catch (error) {
    console.error("Error creating fine:", error);
    throw error;
  }
};

// ✅ Mark attendance for a single student
export const markAttendance = async (req, res) => {
  try {
    const { classId, studentId, date, status, remarks, checkInTime, checkOutTime } = req.body;
    console.log("Request user:", req.user);
    const takenBy = req.user.id; // Get from authenticated user

    // Validate required fields
    if (!classId || !studentId || !date || !status) {
      return res.status(400).json({
        message: "classId, studentId, date, and status are required"
      });
    }

    // Validate status
    if (!["present", "absent", "leave"].includes(status)) {
      return res.status(400).json({
        message: "Status must be one of: present, absent, leave"
      });
    }


    // Check if class exists
    const classExists = await Class.findById(classId);
    if (!classExists) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Check if student exists and belongs to the class
    const student = await Student.findOne({ userId: studentId, classId });
    if (!student) {
      return res.status(404).json({
        message: "Student not found or does not belong to this class"
      });
    }

    // Parse date and set to beginning of day UTC for consistency
    const attendanceDate = new Date(date);
    attendanceDate.setUTCHours(0, 0, 0, 0);

    // Check if attendance already exists for this student on this date
    const existingAttendance = await Attendance.findOne({
      studentId,
      classId,
      date: attendanceDate
    });

    let savedAttendance;

    if (existingAttendance) {
      // Update existing attendance
      existingAttendance.status = status;
      existingAttendance.takenBy = takenBy;
      existingAttendance.remarks = remarks || existingAttendance.remarks;
      existingAttendance.checkInTime = checkInTime || existingAttendance.checkInTime;
      existingAttendance.checkOutTime = checkOutTime || existingAttendance.checkOutTime;

      savedAttendance = await existingAttendance.save();
      await savedAttendance.populate([
        { path: 'studentId', select: 'name udise ePunjabId' },
        { path: 'classId', select: 'name section' },
        { path: 'takenBy', select: 'name udise ePunjabId role' }
      ]);

      // ✅ Auto-create fine for absent students (for updated records)
      if (status === 'absent') {
        try {
          await createFineForAbsent(
            savedAttendance._id,
            studentId,
            classId,
            attendanceDate
          );
          console.log(`Fine created/updated for absent student: ${studentId}`);
        } catch (fineError) {
          console.error("Error creating fine:", fineError);
          // Don't fail the attendance marking if fine creation fails
        }
      }

      return res.json({
        message: "Attendance updated successfully",
        attendance: savedAttendance
      });
    }

    // Create new attendance record
    const newAttendance = new Attendance({
      classId,
      studentId,
      date: attendanceDate,
      status,
      takenBy,
      remarks: remarks || "",
      checkInTime,
      checkOutTime
    });

    savedAttendance = await newAttendance.save();
    await savedAttendance.populate([
      { path: 'studentId', select: 'name udise ePunjabId' },
      { path: 'classId', select: 'name section' },
      { path: 'takenBy', select: 'name udise ePunjabId role' }
    ]);

    // ✅ Auto-create fine for absent students (for new records)
    if (status === 'absent') {
      try {
        await createFineForAbsent(
          savedAttendance._id,
          studentId,
          classId,
          attendanceDate
        );
        console.log(`Fine created for absent student: ${studentId}`);
      } catch (fineError) {
        console.error("Error creating fine:", fineError);
        // Don't fail the attendance marking if fine creation fails
      }
    }

    res.status(201).json({
      message: "Attendance marked successfully",
      attendance: savedAttendance
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        message: "Attendance already marked for this student on this date"
      });
    }
    res.status(500).json({ message: "Error marking attendance", error: err.message });
  }
};

// ✅ Mark attendance for multiple students (bulk operation)
export const markBulkAttendance = async (req, res) => {
  try {
    const { classId, date, attendanceRecords } = req.body;
    const takenBy = req.user.id;

    if (!classId || !date || !attendanceRecords || !Array.isArray(attendanceRecords)) {
      return res.status(400).json({
        message: "classId, date, and attendanceRecords array are required",
      });
    }

    // ✅ Check if class exists
    const classExists = await Class.findById(classId);
    if (!classExists) {
      return res.status(404).json({ message: "Class not found" });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const results = {
      success: [],
      failed: [],
      updated: [],
    };

    // ✅ Fetch all valid students for this class (map by userId)
    const students = await Student.find({ classId });
    const studentMap = new Map(students.map((s) => [s.userId.toString(), s]));

    // ✅ Fetch all existing attendance for this class & date
    const existing = await Attendance.find({
      classId,
      date: attendanceDate,
      studentId: { $in: attendanceRecords.map((r) => r.studentId) },
    });
    const existingMap = new Map(existing.map((a) => [a.studentId.toString(), a]));

    const newDocs = [];
    const bulkUpdates = [];
    const absentees = []; // store absent records for fine creation

    for (const record of attendanceRecords) {
      const { studentId, status, remarks, checkInTime, checkOutTime } = record;

      // Validate status
      if (!["present", "absent", "leave"].includes(status)) {
        results.failed.push({
          studentId,
          reason: "Invalid status. Must be: present, absent, or leave",
        });
        continue;
      }

      // Validate student belongs to class
      if (!studentMap.has(studentId.toString())) {
        results.failed.push({
          studentId,
          reason: "Student not found or does not belong to this class",
        });
        continue;
      }

      const existingAttendance = existingMap.get(studentId.toString());

      if (existingAttendance) {
        // Prepare update
        bulkUpdates.push({
          updateOne: {
            filter: { _id: existingAttendance._id },
            update: {
              $set: {
                status,
                takenBy,
                remarks: remarks || existingAttendance.remarks,
                checkInTime: checkInTime || existingAttendance.checkInTime,
                checkOutTime: checkOutTime || existingAttendance.checkOutTime,
              },
            },
          },
        });
        results.updated.push(studentId);

        if (status === "absent") {
          absentees.push({ _id: existingAttendance._id, studentId });
        }
      } else {
        // Prepare insert
        newDocs.push({
          classId,
          studentId,
          date: attendanceDate,
          status,
          takenBy,
          remarks: remarks || "",
          checkInTime,
          checkOutTime,
        });
        results.success.push(studentId);

        if (status === "absent") {
          absentees.push({ studentId }); // _id will come after insert
        }
      }
    }

    // ✅ Insert new docs in bulk
    let insertedDocs = [];
    if (newDocs.length > 0) {
      insertedDocs = await Attendance.insertMany(newDocs, { ordered: false });
      // attach inserted _ids for absentees
      insertedDocs.forEach((doc) => {
        if (doc.status === "absent") {
          absentees.push({ _id: doc._id, studentId: doc.studentId });
        }
      });
    }

    // ✅ Bulk update existing docs
    if (bulkUpdates.length > 0) {
      await Attendance.bulkWrite(bulkUpdates);
    }

    // ✅ Create fines for absentees
    for (const absent of absentees) {
      try {
        await createFineForAbsent(
          absent._id,
          absent.studentId,
          classId,
          attendanceDate
        );
        console.log(`Fine created for absent student: ${absent.studentId}`);
      } catch (fineError) {
        console.error(
          "Error creating fine for student:",
          absent.studentId,
          fineError
        );
      }
    }

    res.json({
      message: "Bulk attendance marking completed",
      results,
    });
  } catch (err) {
    console.error("Error marking bulk attendance:", err);
    res
      .status(500)
      .json({ message: "Error marking bulk attendance", error: err.message });
  }
};
// export const markBulkAttendance = async (req, res) => {
//   try {
//     const { classId, date, attendanceRecords } = req.body;
//     const takenBy = req.user.id;

//     if (!classId || !date || !attendanceRecords || !Array.isArray(attendanceRecords)) {
//       return res.status(400).json({
//         message: "classId, date, and attendanceRecords array are required"
//       });
//     }

//     // Check if class exists
//     const classExists = await Class.findById(classId);
//     if (!classExists) {
//       return res.status(404).json({ message: "Class not found" });
//     }

//     const attendanceDate = new Date(date);
//     attendanceDate.setUTCHours(0, 0, 0, 0);

//     const results = {
//       success: [],
//       failed: [],
//       updated: []
//     };

//     // Process each attendance record
//     for (const record of attendanceRecords) {
//       try {
//         const { studentId, status, remarks, checkInTime, checkOutTime } = record;

//         // Validate status
//         if (!["present", "absent", "leave"].includes(status)) {
//           results.failed.push({
//             studentId,
//             reason: "Invalid status. Must be: present, absent, or leave"
//           });
//           continue;
//         }

//         // Check if student belongs to the class
//         const student = await Student.findOne({ userId: studentId, classId });
//         if (!student) {
//           results.failed.push({
//             studentId,
//             reason: "Student not found or does not belong to this class"
//           });
//           continue;
//         }

//         // Check for existing attendance
//         const existingAttendance = await Attendance.findOne({
//           studentId,
//           classId,
//           date: attendanceDate
//         });

//         let attendanceRecord;

//         if (existingAttendance) {
//           // Update existing
//           existingAttendance.status = status;
//           existingAttendance.takenBy = takenBy;
//           existingAttendance.remarks = remarks || existingAttendance.remarks;
//           existingAttendance.checkInTime = checkInTime || existingAttendance.checkInTime;
//           existingAttendance.checkOutTime = checkOutTime || existingAttendance.checkOutTime;

//           attendanceRecord = await existingAttendance.save();
//           results.updated.push(studentId);
//         } else {
//           // Create new
//           const newAttendance = new Attendance({
//             classId,
//             studentId,
//             date: attendanceDate,
//             status,
//             takenBy,
//             remarks: remarks || "",
//             checkInTime,
//             checkOutTime
//           });

//           attendanceRecord = await newAttendance.save();
//           results.success.push(studentId);
//         }

//         // ✅ Auto-create fine for absent students (for both new and updated records)
//         if (status === 'absent') {
//           try {
//             await createFineForAbsent(
//               attendanceRecord._id,
//               studentId,
//               classId,
//               attendanceDate
//             );
//             console.log(`Fine created for absent student: ${studentId}`);
//           } catch (fineError) {
//             console.error("Error creating fine for student:", studentId, fineError);
//             // Don't fail the attendance marking if fine creation fails
//           }
//         }

//       } catch (error) {
//         results.failed.push({
//           studentId: record.studentId,
//           reason: error.message
//         });
//       }
//     }

//     res.json({
//       message: "Bulk attendance marking completed",
//       results
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Error marking bulk attendance", error: err.message });
//   }
// };

// ✅ Get attendance for a specific class on a specific date
export const getClassAttendance = async (req, res) => {
  try {
    const { classId, date } = req.query;

    if (!classId || !date) {
      return res.status(400).json({ message: "classId and date are required" });
    }

    const attendanceDate = new Date(date);
    const startOfDay = new Date(attendanceDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(attendanceDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 1️⃣ Get all students
    const students = await Student.find({ classId })
      .populate('userId', 'name udise ePunjabId')
      .select('userId studentImg');

    console.log(`Found ${students.length} students in class ${classId}`);

    // 2️⃣ Get attendance records
    const attendanceRecords = await Attendance.find({
      classId,
      date: { $gte: startOfDay, $lte: endOfDay },
    }).populate([
      { path: 'studentId', select: 'name udise ePunjabId' },
      { path: 'takenBy', select: 'name role' },
    ]);

    console.log(`Found ${attendanceRecords.length} attendance records`);

    // 3️⃣ Create a map safely
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      if (record.studentId && record.studentId._id) {
        attendanceMap.set(record.studentId._id.toString(), record);
      } else {
        console.warn("⚠️ Skipping attendance record without valid studentId:", record._id);
      }
    });

    // 4️⃣ Prepare response
    const response = students.map(student => {
      const attendance = attendanceMap.get(student.userId._id.toString());
      return {
        studentId: student.userId._id,
        studentName: student.userId.name,
        studentUdise: student.userId.udise,
        studentEPunjabId: student.userId.ePunjabId,
        studentImg: student.studentImg, // ✅ Add student image here
        status: attendance ? attendance.status : 'not-marked',
        remarks: attendance ? attendance.remarks || '' : '',
        checkInTime: attendance ? attendance.checkInTime || null : null,
        checkOutTime: attendance ? attendance.checkOutTime || null : null,
        takenBy: attendance ? attendance.takenBy || null : null,
        attendanceId: attendance ? attendance._id : null,
      };
    });

    console.log(`Prepared attendance response for ${response.length} students`);

    res.json({
      classId,
      date: attendanceDate.toISOString().split('T')[0],
      attendance: response,
      totalStudents: students.length,
    });
  } catch (err) {
    console.error("❌ Error in getClassAttendance:", err);
    res.status(500).json({ message: "Error fetching class attendance", error: err.message });
  }
};


// ✅ Get attendance for a specific student
export const getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate, classId } = req.query;

    const query = { studentId };

    // Add class filter if provided
    if (classId) {
      query.classId = classId;
    }

    // Add date range filter
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (startDate) {
      query.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      query.date = { $lte: new Date(endDate) };
    }

    const attendance = await Attendance.find(query)
      .populate([
        { path: 'classId', select: 'name section' },
        { path: 'takenBy', select: 'name role' }
      ])
      .sort({ date: -1 });


    // Calculate attendance statistics
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'present').length,
      absent: attendance.filter(a => a.status === 'absent').length,
      leave: attendance.filter(a => a.status === 'leave').length,
      attendancePercentage: 0,
    };

    if (stats.total > 0) {
      const attendedDays = stats.present;
      stats.attendancePercentage = ((attendedDays / stats.total) * 100).toFixed(2);
    }

    // Get student details
    const student = await User.findById(studentId).select('name udise ePunjabId');

    res.json({
      student,
      attendance,
      stats
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching student attendance", error: err.message });
  }
};

// ✅ Update attendance record
export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, checkInTime, checkOutTime } = req.body;

    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    // Validate status
    if (status && !["present", "absent", "leave"].includes(status)) {
      return res.status(400).json({
        message: "Status must be one of: present, absent, leave"
      });
    }

    const previousStatus = attendance.status;

    // Update fields if provided
    if (status) attendance.status = status;
    if (remarks !== undefined) attendance.remarks = remarks;
    if (checkInTime !== undefined) attendance.checkInTime = checkInTime;
    if (checkOutTime !== undefined) attendance.checkOutTime = checkOutTime;


    attendance.takenBy = req.user.id; // Update who modified the record

    const updatedAttendance = await attendance.save();
    await updatedAttendance.populate([
      { path: 'studentId', select: 'name udise ePunjabId' },
      { path: 'classId', select: 'name section' },
      { path: 'takenBy', select: 'name udise ePunjabId role' }
    ]);

    // ✅ Auto-create/update fine when status changes to absent
    if (status === 'absent' && previousStatus !== 'absent') {
      try {
        await createFineForAbsent(
          updatedAttendance._id,
          updatedAttendance.studentId._id,
          updatedAttendance.classId._id,
          updatedAttendance.date
        );
        console.log(`Fine created for newly absent student: ${updatedAttendance.studentId._id}`);
      } catch (fineError) {
        console.error("Error creating fine:", fineError);
      }
    }

    res.json({
      message: "Attendance updated successfully",
      attendance: updatedAttendance
    });
  } catch (err) {
    res.status(500).json({ message: "Error updating attendance", error: err.message });
  }
};

// ✅ Delete attendance record
export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByIdAndDelete(id);
    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    // ✅ Also delete associated fine record if exists
    try {
      await Fine.deleteOne({ attendanceId: id });
      console.log(`Associated fine record deleted for attendance: ${id}`);
    } catch (fineError) {
      console.error("Error deleting associated fine:", fineError);
    }

    res.json({ message: "Attendance record deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting attendance", error: err.message });
  }
};

// ✅ Get attendance report for a class (monthly/weekly)
export const getAttendanceReport = async (req, res) => {
  try {
    const { classId, month, year } = req.query;

    if (!classId || !month || !year) {
      return res.status(400).json({ message: "classId, month, and year are required" });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Get all students in the class
    const students = await Student.find({ classId })
      .populate('userId', 'name udise ePunjabId')
      .select('userId studentImg'); // ✅ Add studentImg

    // Get all attendance records for the month
    const attendanceRecords = await Attendance.find({
      classId,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // Prepare report data
    const report = students.map(student => {
      const studentAttendance = attendanceRecords.filter(
        record => record.studentId.toString() === student.userId._id.toString()
      );

      const stats = {
        studentId: student.userId._id,
        studentName: student.userId.name,
        studentUdise: student.userId.udise,
        studentEPunjabId: student.userId.ePunjabId,
        studentImg: student.studentImg, // ✅ Add student image

        totalDays: 0,
        present: 0,
        absent: 0,
        leave: 0,
        attendancePercentage: 0,
        records: []
      };

      studentAttendance.forEach(record => {
        stats.totalDays++;
        stats[record.status]++;
        stats.records.push({
          date: record.date,
          status: record.status,
          remarks: record.remarks
        });
      });

      if (stats.totalDays > 0) {
        const attendedDays = stats.present;
        stats.attendancePercentage = ((attendedDays / stats.totalDays) * 100).toFixed(2);
      }

      return stats;
    });

    res.json({
      classId,
      month,
      year,
      startDate,
      endDate,
      report
    });
  } catch (err) {
    res.status(500).json({ message: "Error generating attendance report", error: err.message });
  }
};

// ✅ Get today's attendance summary for all classes (Dashboard)
export const getTodayAttendanceSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all classes
    const classes = await Class.find().populate('incharge', 'name');

    const summary = await Promise.all(
      classes.map(async (cls) => {
        // Get total students in class
        const totalStudents = await Student.countDocuments({ classId: cls._id });

        // Get attendance summary for today
        const attendanceSummary = await Attendance.getClassAttendanceSummary(cls._id, today);

        return {
          classId: cls._id,
          className: cls.name,
          section: cls.section,
          incharge: cls.incharge,
          totalStudents,
          attendanceSummary,
          attendanceMarked: attendanceSummary.total > 0
        };
      })
    );

    res.json({
      date: today.toISOString().split('T')[0],
      summary
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching today's attendance summary", error: err.message });
  }

};
