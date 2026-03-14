import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import User from "../models/User.js";
import Fine from "../models/Fine.js";
import Holiday from "../models/Holiday.js";
import Session from "../models/Session.js";

// ✅ LEAVE LIMIT MANAGEMENT
const LEAVE_LIMIT = 30;

// ✅ Get current session's start and end dates
const getSessionDates = async () => {
  try {
    // Get the most recent active session
    const session = await Session.findOne(
      { startDate: { $lte: new Date() } },
      { startDate: 1, endDate: 1 }
    ).sort({ startDate: -1 }).limit(1);

    if (!session) {
      // If no session found, use academic year calculation (April 1)
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      
      let startDate, endDate;
      if (currentMonth >= 4) {
        startDate = new Date(currentYear, 3, 1); // April 1 of current year
        endDate = new Date(currentYear + 1, 2, 31); // March 31 of next year
      } else {
        startDate = new Date(currentYear - 1, 3, 1); // April 1 of previous year
        endDate = new Date(currentYear, 2, 31); // March 31 of current year
      }
      return { startDate, endDate };
    }

    return {
      startDate: session.startDate,
      endDate: session.endDate || new Date(session.startDate.getFullYear() + 1, 2, 31)
    };
  } catch (error) {
    console.error("Error getting session dates:", error);
    // Fallback to academic year
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    if (currentMonth >= 4) {
      return {
        startDate: new Date(currentYear, 3, 1),
        endDate: new Date(currentYear + 1, 2, 31)
      };
    } else {
      return {
        startDate: new Date(currentYear - 1, 3, 1),
        endDate: new Date(currentYear, 2, 31)
      };
    }
  }
};

// ✅ Count total leaves for a student in current session
const countStudentLeaves = async (studentId, classId) => {
  try {
    const { startDate, endDate } = await getSessionDates();
    
    const leaveCount = await Attendance.countDocuments({
      studentId,
      classId,
      status: 'leave',
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });

    return leaveCount;
  } catch (error) {
    console.error("Error counting student leaves:", error);
    return 0;
  }
};

// ✅ Check if student can take more leaves
const checkLeaveLimit = async (studentId, classId, currentLeaveCount = null) => {
  try {
    const leaves = currentLeaveCount !== null ? currentLeaveCount : await countStudentLeaves(studentId, classId);
    
    return {
      canAddLeave: leaves < LEAVE_LIMIT,
      currentLeaves: leaves,
      remainingLeaves: Math.max(0, LEAVE_LIMIT - leaves),
      maximumLeaves: LEAVE_LIMIT,
      isAtLimit: leaves >= LEAVE_LIMIT
    };
  } catch (error) {
    console.error("Error checking leave limit:", error);
    return {
      canAddLeave: true,
      currentLeaves: 0,
      remainingLeaves: LEAVE_LIMIT,
      maximumLeaves: LEAVE_LIMIT,
      isAtLimit: false
    };
  }
};

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

    // 🚨 CHECK LEAVE LIMIT if marking as leave
    if (status === 'leave') {
      const leaveStatus = await checkLeaveLimit(studentId, classId);
      
      if (!leaveStatus.canAddLeave) {
        return res.status(400).json({
          message: `Leave limit reached! This student already has ${leaveStatus.currentLeaves} leaves (max: ${LEAVE_LIMIT}). No more leaves can be added.`,
          alert: {
            type: 'LEAVE_LIMIT_EXCEEDED',
            studentId,
            currentLeaves: leaveStatus.currentLeaves,
            maximumLeaves: LEAVE_LIMIT,
            remainingLeaves: 0
          }
        });
      }
    }

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

// ✅ Mark attendance for multiple students (bulk)
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

    // 🚨 PRE-FETCH leave counts for all students to optimize queries
    const studentLeaveCounts = new Map();
    for (const record of attendanceRecords) {
      if (record.status === 'leave' && !studentLeaveCounts.has(record.studentId)) {
        const leaveCount = await countStudentLeaves(record.studentId, classId);
        studentLeaveCounts.set(record.studentId, leaveCount);
      }
    }

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

      // 🚨 CHECK LEAVE LIMIT for this student if marking as leave
      if (status === 'leave') {
        const currentLeaves = studentLeaveCounts.get(studentId) || 0;
        const leaveStatus = await checkLeaveLimit(studentId, classId, currentLeaves);
        
        if (!leaveStatus.canAddLeave) {
          results.failed.push({
            studentId,
            reason: `Leave limit exceeded! Student already has ${leaveStatus.currentLeaves} leaves (max: ${LEAVE_LIMIT}). No more leaves can be added.`,
            alert: {
              type: 'LEAVE_LIMIT_EXCEEDED',
              currentLeaves: leaveStatus.currentLeaves,
              maximumLeaves: LEAVE_LIMIT
            }
          });
          continue;
        }
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

    // 🚨 CRITICAL FIX: Only get students who were created ON or BEFORE the selected date
    const students = await Student.find({
      classId,
      createdAt: { $lte: endOfDay } // Only students created before or on the selected date
    })
      .populate('userId', 'name udise ePunjabId')
      .select('userId studentImg createdAt'); // ✅ Include createdAt

    console.log(`Found ${students.length} students in class ${classId} who were created on or before ${date}`);

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

    // 4️⃣ Prepare response - ONLY include students who existed on that date
    const response = students.map(student => {
      const attendance = attendanceMap.get(student.userId._id.toString());
      return {
        studentId: student.userId._id,
        studentName: student.userId.name,
        studentUdise: student.userId.udise,
        studentEPunjabId: student.userId.ePunjabId,
        studentImg: student.studentImg,
        createdAt: student.createdAt, // ✅ Include createdAt for debugging
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

    // 🚨 CHECK LEAVE LIMIT if updating status to 'leave'
    if (status === 'leave' && previousStatus !== 'leave') {
      const leaveStatus = await checkLeaveLimit(attendance.studentId, attendance.classId);
      
      if (!leaveStatus.canAddLeave) {
        return res.status(400).json({
          message: `Leave limit reached! This student already has ${leaveStatus.currentLeaves} leaves (max: ${LEAVE_LIMIT}). Cannot update to leave status.`,
          alert: {
            type: 'LEAVE_LIMIT_EXCEEDED',
            studentId: attendance.studentId,
            currentLeaves: leaveStatus.currentLeaves,
            maximumLeaves: LEAVE_LIMIT,
            remainingLeaves: 0
          }
        });
      }
    }

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

    // 🚨 CRITICAL FIX: Get students who existed during the report period
    const students = await Student.find({
      classId,
      createdAt: { $lte: endDate } // Only students created before or during the report month
    })
      .populate('userId', 'name udise ePunjabId')
      .select('userId studentImg createdAt');

    // Get all attendance records for the month
    const attendanceRecords = await Attendance.find({
      classId,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // Prepare report data - only for students who existed during that period
    const report = students.map(student => {
      const studentAttendance = attendanceRecords.filter(
        record => record.studentId.toString() === student.userId._id.toString()
      );

      const stats = {
        studentId: student.userId._id,
        studentName: student.userId.name,
        studentUdise: student.userId.udise,
        studentEPunjabId: student.userId.ePunjabId,
        studentImg: student.studentImg,
        createdAt: student.createdAt, // ✅ Include for reference
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

// ✅ Get attendance status for all classes for a specific date
export const getClassesAttendanceStatus = async (req, res) => {
  try {
    const { date, type = 'daily' } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setUTCHours(0, 0, 0, 0);

    // Get all classes
    const classes = await Class.find().populate('incharge', 'name');

    const statusPromises = classes.map(async (cls) => {
      if (type === 'daily') {
        // Daily status - check if attendance marked for specific date
        const endOfDay = new Date(targetDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const attendanceRecords = await Attendance.find({
          classId: cls._id,
          date: { $gte: targetDate, $lte: endOfDay }
        });

        const totalStudents = await Student.countDocuments({
          classId: cls._id,
          createdAt: { $lte: endOfDay }
        });

        return {
          classId: cls._id,
          className: cls.name,
          section: cls.section,
          incharge: cls.incharge,
          totalStudents,
          markedCount: attendanceRecords.length,
          attendanceMarked: attendanceRecords.length > 0,
          date: targetDate.toISOString().split('T')[0]
        };
      } else {
        // Monthly status - count marked days in the month
        const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
        endOfMonth.setUTCHours(23, 59, 59, 999);

        const distinctDates = await Attendance.distinct('date', {
          classId: cls._id,
          date: { $gte: startOfMonth, $lte: endOfMonth }
        });

        const totalStudents = await Student.countDocuments({
          classId: cls._id,
          createdAt: { $lte: endOfMonth }
        });

        return {
          classId: cls._id,
          className: cls.name,
          section: cls.section,
          incharge: cls.incharge,
          totalStudents,
          markedCount: distinctDates.length,
          attendanceMarked: distinctDates.length > 0,
          month: targetDate.getMonth() + 1,
          year: targetDate.getFullYear()
        };
      }
    });

    const statusResults = await Promise.all(statusPromises);

    res.json({
      date: targetDate.toISOString().split('T')[0],
      type,
      classes: statusResults
    });
  } catch (err) {
    console.error("Error fetching classes attendance status:", err);
    res.status(500).json({
      message: "Error fetching classes attendance status",
      error: err.message
    });
  }
};


// ✅ Get unmarked attendance alerts for a class with multiple options
export const getUnmarkedAttendanceAlerts = async (req, res) => {
  try {
    const { 
      classId, 
      startDate,  // Optional: custom start date
      endDate,    // Optional: custom end date (defaults to yesterday)
      rangeType = 'session' // 'session', 'month', 'custom'
    } = req.query;

    if (!classId) {
      return res.status(400).json({ message: "classId is required" });
    }

    // Check if class exists
    const classExists = await Class.findById(classId);
    if (!classExists) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Calculate dates based on rangeType
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let startDateObj, endDateObj;
    
    switch (rangeType) {
      case 'session':
        // Automatic session calculation (April 1)
        startDateObj = calculateSessionStartDate(today);
        endDateObj = new Date(today);
        endDateObj.setDate(endDateObj.getDate() - 1); // Yesterday
        endDateObj.setUTCHours(23, 59, 59, 999);
        break;
        
      case 'month':
        // Current month
        startDateObj = new Date(today.getFullYear(), today.getMonth(), 1);
        endDateObj = new Date(today);
        endDateObj.setDate(endDateObj.getDate() - 1);
        endDateObj.setUTCHours(23, 59, 59, 999);
        break;
        
      case 'custom':
        // Custom dates provided by user
        if (!startDate || !endDate) {
          return res.status(400).json({ 
            message: "startDate and endDate are required for custom range" 
          });
        }
        startDateObj = new Date(startDate);
        endDateObj = new Date(endDate);
        startDateObj.setUTCHours(0, 0, 0, 0);
        endDateObj.setUTCHours(23, 59, 59, 999);
        break;
        
      default:
        return res.status(400).json({ 
          message: "rangeType must be one of: session, month, custom" 
        });
    }

    // Don't allow start date to be after end date
    if (startDateObj > endDateObj) {
      return res.json({
        classId,
        className: classExists.name,
        section: classExists.section,
        message: "Invalid date range: start date is after end date",
        dateRange: {
          start: startDateObj.toISOString().split('T')[0],
          end: endDateObj.toISOString().split('T')[0]
        },
        totalAlerts: 0,
        holidaysExcluded: 0,
        alerts: []
      });
    }

    // 1️⃣ Get all holidays in the date range
    const holidays = await Holiday.find({
      date: {
        $gte: startDateObj,
        $lte: endDateObj
      }
    });

    // Convert holiday dates to comparable format (YYYY-MM-DD)
    const holidayDates = new Set(
      holidays.map(h => h.date.toISOString().split('T')[0])
    );

    console.log(`Date range: ${startDateObj.toISOString().split('T')[0]} to ${endDateObj.toISOString().split('T')[0]}`);
    console.log(`Found ${holidays.length} holidays in range`);

    // 2️⃣ Get all students in the class (who were created before the end date)
    const students = await Student.find({
      classId,
      createdAt: { $lte: endDateObj }
    }).populate('userId', 'name udise ePunjabId');

    if (students.length === 0) {
      return res.json({
        classId,
        alerts: [],
        message: "No students found in this class"
      });
    }

    // 3️⃣ Get all dates in the range (excluding holidays)
    const allDates = [];
    const currentDate = new Date(startDateObj);
    
    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Only add if it's not a holiday
      if (!holidayDates.has(dateStr)) {
        allDates.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`Total dates to check (excluding holidays): ${allDates.length}`);

    // 4️⃣ Get all existing attendance records for the date range
    const attendanceRecords = await Attendance.find({
      classId,
      date: {
        $gte: startDateObj,
        $lte: endDateObj
      }
    });

    // Create a map of marked attendance (date + studentId)
    const markedAttendanceMap = new Map();
    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0];
      const key = `${record.studentId.toString()}_${dateStr}`;
      markedAttendanceMap.set(key, true);
    });

    // 5️⃣ Build alerts for unmarked attendance
    const alerts = [];

    for (const date of allDates) {
      const dateStr = date.toISOString().split('T')[0];
      const unmarkedStudents = [];

      for (const student of students) {
        // Check if student was created on or before this date
        const studentCreatedDate = new Date(student.createdAt);
        studentCreatedDate.setUTCHours(0, 0, 0, 0);
        
        // Only check attendance for dates after student creation
        if (date >= studentCreatedDate) {
          const key = `${student.userId._id.toString()}_${dateStr}`;
          
          // If attendance is not marked, add to unmarked list
          if (!markedAttendanceMap.has(key)) {
            unmarkedStudents.push({
              studentId: student.userId._id,
              studentName: student.userId.name,
              studentUdise: student.userId.udise,
              studentEPunjabId: student.userId.ePunjabId
            });
          }
        }
      }

      // If there are unmarked students for this date, add alert
      if (unmarkedStudents.length > 0) {
        alerts.push({
          date: dateStr,
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
          unmarkedCount: unmarkedStudents.length,
          totalStudents: students.length,
          message: `Attendance not marked for ${unmarkedStudents.length} student(s) on ${dateStr}. Please mark the attendance for this day.`,
          unmarkedStudents
        });
      }
    }

    // Sort alerts by date (most recent first)
    alerts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate academic year for session range
    let academicYear = null;
    if (rangeType === 'session') {
      academicYear = getAcademicYear(startDateObj);
    }

    res.json({
      classId,
      className: classExists.name,
      section: classExists.section,
      rangeType,
      academicYear,
      dateRange: {
        start: startDateObj.toISOString().split('T')[0],
        end: endDateObj.toISOString().split('T')[0]
      },
      totalAlerts: alerts.length,
      holidaysExcluded: holidays.length,
      totalDatesChecked: allDates.length,
      totalStudents: students.length,
      alerts
    });
  } catch (err) {
    console.error("Error fetching unmarked attendance alerts:", err);
    res.status(500).json({
      message: "Error fetching unmarked attendance alerts",
      error: err.message
    });
  }
};

// ✅ Calculate session start date (April 1 of current academic year)
const calculateSessionStartDate = (today) => {
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  
  if (currentMonth >= 4) {
    // April to December: Session started on April 1 of current year
    return new Date(currentYear, 3, 1); // April is month 3 (0-indexed)
  } else {
    // January to March: Session started on April 1 of previous year
    return new Date(currentYear - 1, 3, 1);
  }
};

// ✅ Get academic year in format "2025-2026"
const getAcademicYear = (sessionStartDate) => {
  const startYear = sessionStartDate.getFullYear();
  const endYear = startYear + 1;
  return `${startYear}-${endYear}`;
};

// import Attendance from "../models/Attendance.js";
// import Student from "../models/Student.js";
// import Class from "../models/Class.js";
// import User from "../models/User.js";
// import Fine from "../models/Fine.js";

// // ✅ Create fine for absent student (moved here to avoid circular dependency)
// const createFineForAbsent = async (attendanceId, studentId, classId, date) => {
//   try {
//     // Check if fine already exists
//     const existingFine = await Fine.findOne({ attendanceId });
//     if (existingFine) {
//       return existingFine;
//     }

//     // Create new fine
//     const fine = new Fine({
//       studentId,
//       classId,
//       attendanceId,
//       date: new Date(date),
//       fineAmount: 50, // Rs.50 per absent day
//       paidAmount: 0,
//       pendingAmount: 50,
//       status: "pending",
//       remarks: "Fine for absent day"
//     });

//     return await fine.save();
//   } catch (error) {
//     console.error("Error creating fine:", error);
//     throw error;
//   }
// };

// // ✅ Mark attendance for a single student
// export const markAttendance = async (req, res) => {
//   try {
//     const { classId, studentId, date, status, remarks, checkInTime, checkOutTime } = req.body;
//     console.log("Request user:", req.user);
//     const takenBy = req.user.id; // Get from authenticated user

//     // Validate required fields
//     if (!classId || !studentId || !date || !status) {
//       return res.status(400).json({
//         message: "classId, studentId, date, and status are required"
//       });
//     }

//     // Validate status
//     if (!["present", "absent", "leave"].includes(status)) {
//       return res.status(400).json({
//         message: "Status must be one of: present, absent, leave"
//       });
//     }


//     // Check if class exists
//     const classExists = await Class.findById(classId);
//     if (!classExists) {
//       return res.status(404).json({ message: "Class not found" });
//     }

//     // Check if student exists and belongs to the class
//     const student = await Student.findOne({ userId: studentId, classId });
//     if (!student) {
//       return res.status(404).json({
//         message: "Student not found or does not belong to this class"
//       });
//     }

//     // Parse date and set to beginning of day UTC for consistency
//     const attendanceDate = new Date(date);
//     attendanceDate.setUTCHours(0, 0, 0, 0);

//     // Check if attendance already exists for this student on this date
//     const existingAttendance = await Attendance.findOne({
//       studentId,
//       classId,
//       date: attendanceDate
//     });

//     let savedAttendance;

//     if (existingAttendance) {
//       // Update existing attendance
//       existingAttendance.status = status;
//       existingAttendance.takenBy = takenBy;
//       existingAttendance.remarks = remarks || existingAttendance.remarks;
//       existingAttendance.checkInTime = checkInTime || existingAttendance.checkInTime;
//       existingAttendance.checkOutTime = checkOutTime || existingAttendance.checkOutTime;

//       savedAttendance = await existingAttendance.save();
//       await savedAttendance.populate([
//         { path: 'studentId', select: 'name udise ePunjabId' },
//         { path: 'classId', select: 'name section' },
//         { path: 'takenBy', select: 'name udise ePunjabId role' }
//       ]);

//       // ✅ Auto-create fine for absent students (for updated records)
//       if (status === 'absent') {
//         try {
//           await createFineForAbsent(
//             savedAttendance._id,
//             studentId,
//             classId,
//             attendanceDate
//           );
//           console.log(`Fine created/updated for absent student: ${studentId}`);
//         } catch (fineError) {
//           console.error("Error creating fine:", fineError);
//           // Don't fail the attendance marking if fine creation fails
//         }
//       }

//       return res.json({
//         message: "Attendance updated successfully",
//         attendance: savedAttendance
//       });
//     }

//     // Create new attendance record
//     const newAttendance = new Attendance({
//       classId,
//       studentId,
//       date: attendanceDate,
//       status,
//       takenBy,
//       remarks: remarks || "",
//       checkInTime,
//       checkOutTime
//     });

//     savedAttendance = await newAttendance.save();
//     await savedAttendance.populate([
//       { path: 'studentId', select: 'name udise ePunjabId' },
//       { path: 'classId', select: 'name section' },
//       { path: 'takenBy', select: 'name udise ePunjabId role' }
//     ]);

//     // ✅ Auto-create fine for absent students (for new records)
//     if (status === 'absent') {
//       try {
//         await createFineForAbsent(
//           savedAttendance._id,
//           studentId,
//           classId,
//           attendanceDate
//         );
//         console.log(`Fine created for absent student: ${studentId}`);
//       } catch (fineError) {
//         console.error("Error creating fine:", fineError);
//         // Don't fail the attendance marking if fine creation fails
//       }
//     }

//     res.status(201).json({
//       message: "Attendance marked successfully",
//       attendance: savedAttendance
//     });
//   } catch (err) {
//     if (err.code === 11000) {
//       return res.status(400).json({
//         message: "Attendance already marked for this student on this date"
//       });
//     }
//     res.status(500).json({ message: "Error marking attendance", error: err.message });
//   }
// };

// // ✅ Mark attendance for multiple students (bulk)
// export const markBulkAttendance = async (req, res) => {
//   try {
//     const { classId, date, attendanceRecords } = req.body;
//     const takenBy = req.user.id;

//     if (!classId || !date || !attendanceRecords || !Array.isArray(attendanceRecords)) {
//       return res.status(400).json({
//         message: "classId, date, and attendanceRecords array are required",
//       });
//     }

//     // ✅ Check if class exists
//     const classExists = await Class.findById(classId);
//     if (!classExists) {
//       return res.status(404).json({ message: "Class not found" });
//     }

//     const attendanceDate = new Date(date);
//     attendanceDate.setUTCHours(0, 0, 0, 0);

//     const results = {
//       success: [],
//       failed: [],
//       updated: [],
//     };

//     // ✅ Fetch all valid students for this class (map by userId)
//     const students = await Student.find({ classId });
//     const studentMap = new Map(students.map((s) => [s.userId.toString(), s]));

//     // ✅ Fetch all existing attendance for this class & date
//     const existing = await Attendance.find({
//       classId,
//       date: attendanceDate,
//       studentId: { $in: attendanceRecords.map((r) => r.studentId) },
//     });
//     const existingMap = new Map(existing.map((a) => [a.studentId.toString(), a]));

//     const newDocs = [];
//     const bulkUpdates = [];
//     const absentees = []; // store absent records for fine creation

//     for (const record of attendanceRecords) {
//       const { studentId, status, remarks, checkInTime, checkOutTime } = record;

//       // Validate status
//       if (!["present", "absent", "leave"].includes(status)) {
//         results.failed.push({
//           studentId,
//           reason: "Invalid status. Must be: present, absent, or leave",
//         });
//         continue;
//       }

//       // Validate student belongs to class
//       if (!studentMap.has(studentId.toString())) {
//         results.failed.push({
//           studentId,
//           reason: "Student not found or does not belong to this class",
//         });
//         continue;
//       }

//       const existingAttendance = existingMap.get(studentId.toString());

//       if (existingAttendance) {
//         // Prepare update
//         bulkUpdates.push({
//           updateOne: {
//             filter: { _id: existingAttendance._id },
//             update: {
//               $set: {
//                 status,
//                 takenBy,
//                 remarks: remarks || existingAttendance.remarks,
//                 checkInTime: checkInTime || existingAttendance.checkInTime,
//                 checkOutTime: checkOutTime || existingAttendance.checkOutTime,
//               },
//             },
//           },
//         });
//         results.updated.push(studentId);

//         if (status === "absent") {
//           absentees.push({ _id: existingAttendance._id, studentId });
//         }
//       } else {
//         // Prepare insert
//         newDocs.push({
//           classId,
//           studentId,
//           date: attendanceDate,
//           status,
//           takenBy,
//           remarks: remarks || "",
//           checkInTime,
//           checkOutTime,
//         });
//         results.success.push(studentId);

//         if (status === "absent") {
//           absentees.push({ studentId }); // _id will come after insert
//         }
//       }
//     }

//     // ✅ Insert new docs in bulk
//     let insertedDocs = [];
//     if (newDocs.length > 0) {
//       insertedDocs = await Attendance.insertMany(newDocs, { ordered: false });
//       // attach inserted _ids for absentees
//       insertedDocs.forEach((doc) => {
//         if (doc.status === "absent") {
//           absentees.push({ _id: doc._id, studentId: doc.studentId });
//         }
//       });
//     }

//     // ✅ Bulk update existing docs
//     if (bulkUpdates.length > 0) {
//       await Attendance.bulkWrite(bulkUpdates);
//     }

//     // ✅ Create fines for absentees
//     for (const absent of absentees) {
//       try {
//         await createFineForAbsent(
//           absent._id,
//           absent.studentId,
//           classId,
//           attendanceDate
//         );
//         console.log(`Fine created for absent student: ${absent.studentId}`);
//       } catch (fineError) {
//         console.error(
//           "Error creating fine for student:",
//           absent.studentId,
//           fineError
//         );
//       }
//     }

//     res.json({
//       message: "Bulk attendance marking completed",
//       results,
//     });
//   } catch (err) {
//     console.error("Error marking bulk attendance:", err);
//     res
//       .status(500)
//       .json({ message: "Error marking bulk attendance", error: err.message });
//   }
// };

// // ✅ Get attendance for a specific class on a specific date
// export const getClassAttendance = async (req, res) => {
//   try {
//     const { classId, date } = req.query;

//     if (!classId || !date) {
//       return res.status(400).json({ message: "classId and date are required" });
//     }

//     const attendanceDate = new Date(date);
//     const startOfDay = new Date(attendanceDate);
//     startOfDay.setUTCHours(0, 0, 0, 0);

//     const endOfDay = new Date(attendanceDate);
//     endOfDay.setUTCHours(23, 59, 59, 999);

//     // 🚨 CRITICAL FIX: Only get students who were created ON or BEFORE the selected date
//     const students = await Student.find({
//       classId,
//       createdAt: { $lte: endOfDay } // Only students created before or on the selected date
//     })
//       .populate('userId', 'name udise ePunjabId')
//       .select('userId studentImg createdAt'); // ✅ Include createdAt

//     console.log(`Found ${students.length} students in class ${classId} who were created on or before ${date}`);

//     // 2️⃣ Get attendance records
//     const attendanceRecords = await Attendance.find({
//       classId,
//       date: { $gte: startOfDay, $lte: endOfDay },
//     }).populate([
//       { path: 'studentId', select: 'name udise ePunjabId' },
//       { path: 'takenBy', select: 'name role' },
//     ]);

//     console.log(`Found ${attendanceRecords.length} attendance records`);

//     // 3️⃣ Create a map safely
//     const attendanceMap = new Map();
//     attendanceRecords.forEach(record => {
//       if (record.studentId && record.studentId._id) {
//         attendanceMap.set(record.studentId._id.toString(), record);
//       } else {
//         console.warn("⚠️ Skipping attendance record without valid studentId:", record._id);
//       }
//     });

//     // 4️⃣ Prepare response - ONLY include students who existed on that date
//     const response = students.map(student => {
//       const attendance = attendanceMap.get(student.userId._id.toString());
//       return {
//         studentId: student.userId._id,
//         studentName: student.userId.name,
//         studentUdise: student.userId.udise,
//         studentEPunjabId: student.userId.ePunjabId,
//         studentImg: student.studentImg,
//         createdAt: student.createdAt, // ✅ Include createdAt for debugging
//         status: attendance ? attendance.status : 'not-marked',
//         remarks: attendance ? attendance.remarks || '' : '',
//         checkInTime: attendance ? attendance.checkInTime || null : null,
//         checkOutTime: attendance ? attendance.checkOutTime || null : null,
//         takenBy: attendance ? attendance.takenBy || null : null,
//         attendanceId: attendance ? attendance._id : null,
//       };
//     });

//     console.log(`Prepared attendance response for ${response.length} students`);

//     res.json({
//       classId,
//       date: attendanceDate.toISOString().split('T')[0],
//       attendance: response,
//       totalStudents: students.length,
//     });
//   } catch (err) {
//     console.error("❌ Error in getClassAttendance:", err);
//     res.status(500).json({ message: "Error fetching class attendance", error: err.message });
//   }
// };

// // ✅ Get attendance for a specific student
// export const getStudentAttendance = async (req, res) => {
//   try {
//     const { studentId } = req.params;
//     const { startDate, endDate, classId } = req.query;

//     const query = { studentId };

//     // Add class filter if provided
//     if (classId) {
//       query.classId = classId;
//     }

//     // Add date range filter
//     if (startDate && endDate) {
//       query.date = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     } else if (startDate) {
//       query.date = { $gte: new Date(startDate) };
//     } else if (endDate) {
//       query.date = { $lte: new Date(endDate) };
//     }

//     const attendance = await Attendance.find(query)
//       .populate([
//         { path: 'classId', select: 'name section' },
//         { path: 'takenBy', select: 'name role' }
//       ])
//       .sort({ date: -1 });


//     // Calculate attendance statistics
//     const stats = {
//       total: attendance.length,
//       present: attendance.filter(a => a.status === 'present').length,
//       absent: attendance.filter(a => a.status === 'absent').length,
//       leave: attendance.filter(a => a.status === 'leave').length,
//       attendancePercentage: 0,
//     };

//     if (stats.total > 0) {
//       const attendedDays = stats.present;
//       stats.attendancePercentage = ((attendedDays / stats.total) * 100).toFixed(2);
//     }

//     // Get student details
//     const student = await User.findById(studentId).select('name udise ePunjabId');

//     res.json({
//       student,
//       attendance,
//       stats
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching student attendance", error: err.message });
//   }
// };

// // ✅ Update attendance record
// export const updateAttendance = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status, remarks, checkInTime, checkOutTime } = req.body;

//     const attendance = await Attendance.findById(id);
//     if (!attendance) {
//       return res.status(404).json({ message: "Attendance record not found" });
//     }

//     // Validate status
//     if (status && !["present", "absent", "leave"].includes(status)) {
//       return res.status(400).json({
//         message: "Status must be one of: present, absent, leave"
//       });
//     }

//     const previousStatus = attendance.status;

//     // Update fields if provided
//     if (status) attendance.status = status;
//     if (remarks !== undefined) attendance.remarks = remarks;
//     if (checkInTime !== undefined) attendance.checkInTime = checkInTime;
//     if (checkOutTime !== undefined) attendance.checkOutTime = checkOutTime;


//     attendance.takenBy = req.user.id; // Update who modified the record

//     const updatedAttendance = await attendance.save();
//     await updatedAttendance.populate([
//       { path: 'studentId', select: 'name udise ePunjabId' },
//       { path: 'classId', select: 'name section' },
//       { path: 'takenBy', select: 'name udise ePunjabId role' }
//     ]);

//     // ✅ Auto-create/update fine when status changes to absent
//     if (status === 'absent' && previousStatus !== 'absent') {
//       try {
//         await createFineForAbsent(
//           updatedAttendance._id,
//           updatedAttendance.studentId._id,
//           updatedAttendance.classId._id,
//           updatedAttendance.date
//         );
//         console.log(`Fine created for newly absent student: ${updatedAttendance.studentId._id}`);
//       } catch (fineError) {
//         console.error("Error creating fine:", fineError);
//       }
//     }

//     res.json({
//       message: "Attendance updated successfully",
//       attendance: updatedAttendance
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Error updating attendance", error: err.message });
//   }
// };

// // ✅ Delete attendance record
// export const deleteAttendance = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const attendance = await Attendance.findByIdAndDelete(id);
//     if (!attendance) {
//       return res.status(404).json({ message: "Attendance record not found" });
//     }

//     // ✅ Also delete associated fine record if exists
//     try {
//       await Fine.deleteOne({ attendanceId: id });
//       console.log(`Associated fine record deleted for attendance: ${id}`);
//     } catch (fineError) {
//       console.error("Error deleting associated fine:", fineError);
//     }

//     res.json({ message: "Attendance record deleted successfully" });
//   } catch (err) {
//     res.status(500).json({ message: "Error deleting attendance", error: err.message });
//   }
// };

// // ✅ Get attendance report for a class (monthly/weekly)
// export const getAttendanceReport = async (req, res) => {
//   try {
//     const { classId, month, year } = req.query;

//     if (!classId || !month || !year) {
//       return res.status(400).json({ message: "classId, month, and year are required" });
//     }

//     const startDate = new Date(year, month - 1, 1);
//     const endDate = new Date(year, month, 0);

//     // 🚨 CRITICAL FIX: Get students who existed during the report period
//     const students = await Student.find({
//       classId,
//       createdAt: { $lte: endDate } // Only students created before or during the report month
//     })
//       .populate('userId', 'name udise ePunjabId')
//       .select('userId studentImg createdAt');

//     // Get all attendance records for the month
//     const attendanceRecords = await Attendance.find({
//       classId,
//       date: {
//         $gte: startDate,
//         $lte: endDate
//       }
//     });

//     // Prepare report data - only for students who existed during that period
//     const report = students.map(student => {
//       const studentAttendance = attendanceRecords.filter(
//         record => record.studentId.toString() === student.userId._id.toString()
//       );

//       const stats = {
//         studentId: student.userId._id,
//         studentName: student.userId.name,
//         studentUdise: student.userId.udise,
//         studentEPunjabId: student.userId.ePunjabId,
//         studentImg: student.studentImg,
//         createdAt: student.createdAt, // ✅ Include for reference
//         totalDays: 0,
//         present: 0,
//         absent: 0,
//         leave: 0,
//         attendancePercentage: 0,
//         records: []
//       };

//       studentAttendance.forEach(record => {
//         stats.totalDays++;
//         stats[record.status]++;
//         stats.records.push({
//           date: record.date,
//           status: record.status,
//           remarks: record.remarks
//         });
//       });

//       if (stats.totalDays > 0) {
//         const attendedDays = stats.present;
//         stats.attendancePercentage = ((attendedDays / stats.totalDays) * 100).toFixed(2);
//       }

//       return stats;
//     });

//     res.json({
//       classId,
//       month,
//       year,
//       startDate,
//       endDate,
//       report
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Error generating attendance report", error: err.message });
//   }
// };

// // ✅ Get today's attendance summary for all classes (Dashboard)
// export const getTodayAttendanceSummary = async (req, res) => {
//   try {
//     const today = new Date();
//     today.setUTCHours(0, 0, 0, 0);
//     const tomorrow = new Date(today);
//     tomorrow.setDate(tomorrow.getDate() + 1);

//     // Get all classes
//     const classes = await Class.find().populate('incharge', 'name');

//     const summary = await Promise.all(
//       classes.map(async (cls) => {
//         // Get total students in class
//         const totalStudents = await Student.countDocuments({ classId: cls._id });

//         // Get attendance summary for today
//         const attendanceSummary = await Attendance.getClassAttendanceSummary(cls._id, today);

//         return {
//           classId: cls._id,
//           className: cls.name,
//           section: cls.section,
//           incharge: cls.incharge,
//           totalStudents,
//           attendanceSummary,
//           attendanceMarked: attendanceSummary.total > 0
//         };
//       })
//     );

//     res.json({
//       date: today.toISOString().split('T')[0],
//       summary
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching today's attendance summary", error: err.message });
//   }
// };

// // ✅ Get attendance status for all classes for a specific date
// export const getClassesAttendanceStatus = async (req, res) => {
//   try {
//     const { date, type = 'daily' } = req.query;

//     const targetDate = date ? new Date(date) : new Date();
//     targetDate.setUTCHours(0, 0, 0, 0);

//     // Get all classes
//     const classes = await Class.find().populate('incharge', 'name');

//     const statusPromises = classes.map(async (cls) => {
//       if (type === 'daily') {
//         // Daily status - check if attendance marked for specific date
//         const endOfDay = new Date(targetDate);
//         endOfDay.setUTCHours(23, 59, 59, 999);

//         const attendanceRecords = await Attendance.find({
//           classId: cls._id,
//           date: { $gte: targetDate, $lte: endOfDay }
//         });

//         const totalStudents = await Student.countDocuments({
//           classId: cls._id,
//           createdAt: { $lte: endOfDay }
//         });

//         return {
//           classId: cls._id,
//           className: cls.name,
//           section: cls.section,
//           incharge: cls.incharge,
//           totalStudents,
//           markedCount: attendanceRecords.length,
//           attendanceMarked: attendanceRecords.length > 0,
//           date: targetDate.toISOString().split('T')[0]
//         };
//       } else {
//         // Monthly status - count marked days in the month
//         const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
//         const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
//         endOfMonth.setUTCHours(23, 59, 59, 999);

//         const distinctDates = await Attendance.distinct('date', {
//           classId: cls._id,
//           date: { $gte: startOfMonth, $lte: endOfMonth }
//         });

//         const totalStudents = await Student.countDocuments({
//           classId: cls._id,
//           createdAt: { $lte: endOfMonth }
//         });

//         return {
//           classId: cls._id,
//           className: cls.name,
//           section: cls.section,
//           incharge: cls.incharge,
//           totalStudents,
//           markedCount: distinctDates.length,
//           attendanceMarked: distinctDates.length > 0,
//           month: targetDate.getMonth() + 1,
//           year: targetDate.getFullYear()
//         };
//       }
//     });

//     const statusResults = await Promise.all(statusPromises);

//     res.json({
//       date: targetDate.toISOString().split('T')[0],
//       type,
//       classes: statusResults
//     });
//   } catch (err) {
//     console.error("Error fetching classes attendance status:", err);
//     res.status(500).json({
//       message: "Error fetching classes attendance status",
//       error: err.message
//     });
//   }
// };

