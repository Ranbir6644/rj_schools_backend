import User from "../models/User.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import Fine from "../models/Fine.js";
import Attendance from "../models/Attendance.js";
import Holiday from "../models/Holiday.js";
import Session from "../models/Session.js";
import mongoose from "mongoose";

// ✅ Get Dashboard Summary (Top 4 Cards)
export const getDashboardSummary = async (req, res) => {
  try {
    // Total Students
    const totalStudents = await User.countDocuments({ role: "student" });

    // Total Teachers
    const totalTeachers = await User.countDocuments({ role: "teacher" });

    // Total Classes
    const totalClasses = await Class.countDocuments();

    // Total Pending Fines (All students across all classes)
    const pendingFinesResult = await Fine.aggregate([
      {
        $group: {
          _id: null,
          totalPendingFines: { $sum: "$pendingAmount" }
        }
      }
    ]);

    const totalPendingFines = pendingFinesResult[0]?.totalPendingFines || 0;

    res.json({
      success: true,
      data: {
        totalStudents,
        totalTeachers,
        totalClasses,
        totalPendingFines
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard summary",
      error: err.message
    });
  }
};

// ✅ Get Attendance Graph Data (with filters for class, month, year)
export const getAttendanceGraphData = async (req, res) => {
  try {
    const { classId, month, year } = req.query;

    // Default to current month and year if not provided
    const currentDate = new Date();
    const currentMonth = month || currentDate.getMonth() + 1; // JavaScript months are 0-indexed
    const currentYear = year || currentDate.getFullYear();

    // Calculate start and end dates for the month
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0); // Last day of the month

    // Build match stage for attendance aggregation
    const attendanceMatchStage = {
      date: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Add class filter if provided and not "all"
    if (classId && classId !== "all") {
      attendanceMatchStage.classId = new mongoose.Types.ObjectId(classId);
    }

    // Get attendance statistics
    const attendanceStats = await Attendance.aggregate([
      { $match: attendanceMatchStage },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize counts
    let present = 0;
    let absent = 0;
    let leave = 0;

    // Process attendance stats
    attendanceStats.forEach(stat => {
      switch (stat._id) {
        case "present":
          present = stat.count;
          break;
        case "absent":
          absent = stat.count;
          break;
        case "leave":
          leave = stat.count;
          break;
      }
    });

    // Get holidays count for the month
    const holidaysCount = await Holiday.countDocuments({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // Build match stage for fines aggregation
    const finesMatchStage = {
      date: {
        $gte: startDate,
        $lte: endDate
      },
      status: { $in: ["pending", "partially_paid"] }
    };

    // Add class filter if provided and not "all"
    if (classId && classId !== "all") {
      finesMatchStage.classId = new mongoose.Types.ObjectId(classId);
    }

    // Get pending fines for the period
    const pendingFinesResult = await Fine.aggregate([
      { $match: finesMatchStage },
      {
        $group: {
          _id: null,
          totalPendingAmount: { $sum: "$pendingAmount" },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    const pendingFines = pendingFinesResult[0]?.totalPendingAmount || 0;

    res.json({
      success: true,
      data: {
        period: {
          month: parseInt(currentMonth),
          year: parseInt(currentYear),
          classId: classId || "all"
        },
        attendance: {
          present,
          absent,
          leave,
          holidays: holidaysCount,
          total: present + absent + leave
        },
        fines: {
          pendingAmount: pendingFines,
          pendingRecords: pendingFinesResult[0]?.totalRecords || 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching attendance graph data",
      error: err.message
    });
  }
};

// ✅ Get Daily Attendance Graph Data (for a specific date)
export const getDailyAttendanceGraphData = async (req, res) => {
  try {
    const { classId, date } = req.query;

    // Default to current date if not provided
    const currentDate = new Date();
    const targetDate = date ? new Date(date) : currentDate;

    // Set the date to start of day and end of day
    const startDate = new Date(targetDate.setHours(0, 0, 0, 0));
    const endDate = new Date(targetDate.setHours(23, 59, 59, 999));

    // Build match stage for attendance aggregation
    const attendanceMatchStage = {
      date: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Add class filter if provided and not "all"
    if (classId && classId !== "all") {
      attendanceMatchStage.classId = new mongoose.Types.ObjectId(classId);
    }

    // Get attendance statistics for the day
    const attendanceStats = await Attendance.aggregate([
      { $match: attendanceMatchStage },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize counts
    let present = 0;
    let absent = 0;
    let leave = 0;

    // Process attendance stats
    attendanceStats.forEach(stat => {
      switch (stat._id) {
        case "present":
          present = stat.count;
          break;
        case "absent":
          absent = stat.count;
          break;
        case "leave":
          leave = stat.count;
          break;
      }
    });

    // Check if the day is a holiday
    const isHoliday = await Holiday.findOne({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });

    const holidaysCount = isHoliday ? 1 : 0;

    // Build match stage for fines aggregation (for the day)
    const finesMatchStage = {
      date: {
        $gte: startDate,
        $lte: endDate
      },
      status: { $in: ["pending", "partially_paid"] }
    };

    // Add class filter if provided and not "all"
    if (classId && classId !== "all") {
      finesMatchStage.classId = new mongoose.Types.ObjectId(classId);
    }

    // Get pending fines for the day
    const pendingFinesResult = await Fine.aggregate([
      { $match: finesMatchStage },
      {
        $group: {
          _id: null,
          totalPendingAmount: { $sum: "$pendingAmount" },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    const pendingFines = pendingFinesResult[0]?.totalPendingAmount || 0;

    res.json({
      success: true,
      data: {
        period: {
          date: targetDate.toISOString().split('T')[0], // YYYY-MM-DD
          classId: classId || "all"
        },
        attendance: {
          present,
          absent,
          leave,
          holidays: holidaysCount,
          total: present + absent + leave
        },
        fines: {
          pendingAmount: pendingFines,
          pendingRecords: pendingFinesResult[0]?.totalRecords || 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching daily attendance graph data",
      error: err.message
    });
  }
};

// ✅ Get Gender Distribution (Pie Chart)
export const getGenderDistribution = async (req, res) => {
  try {
    const user = req.user;
    let matchStage = {};

    // If teacher, filter students by assigned classes
    if (user && user.role === 'teacher') {
      // Find all classes assigned to this teacher
      const teacherClasses = await Class.find({ incharge: user.id }).select('_id');
      const classIds = teacherClasses.map(cls => cls._id);
      if (classIds.length > 0) {
        matchStage.classId = { $in: classIds };
      } else {
        // If teacher has no assigned classes, return zeroes
        return res.json({
          success: true,
          data: { male: 0, female: 0, other: 0, total: 0 }
        });
      }
    }

    const genderStats = await Student.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$gender",
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize gender counts
    let male = 0;
    let female = 0;
    let other = 0;

    // Process gender statistics
    genderStats.forEach(stat => {
      switch (stat._id) {
        case "Male":
          male = stat.count;
          break;
        case "Female":
          female = stat.count;
          break;
        case "Other":
          other = stat.count;
          break;
        default:
          // Handle null or undefined gender
          other += stat.count;
      }
    });

    const totalStudents = male + female + other;

    res.json({
      success: true,
      data: {
        male,
        female,
        other,
        total: totalStudents
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching gender distribution",
      error: err.message
    });
  }
};

// ✅ Get All Classes for Dropdown
export const getAllClasses = async (req, res) => {
  try {
      const user = req.user;
      let teacherId;
      if(user.role === 'teacher') {
        teacherId = user.id;
      }
      const classes = await Class.find().populate({
        path: 'incharge'
      });
  
      const teacherClasses = classes.filter(cls => {
        return cls.incharge && cls.incharge._id.toString() === teacherId;
      });
  
      if(user.role === 'teacher') {
        return res.json(teacherClasses);
      }
  
      res.json(classes);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
};

// ✅ Get Complete Dashboard Data (All in one)
export const getCompleteDashboard = async (req, res) => {
  try {
    const { classId, month, year } = req.query;

    // Get all data in parallel for better performance
    const [
      summaryData,
      graphData,
      genderData,
      classesData
    ] = await Promise.all([
      getDashboardSummaryData(),
      getAttendanceGraphDataInternal(classId, month, year),
      getGenderDistributionData(),
      Class.find().populate('incharge', 'name').select('name section incharge').sort({ name: 1 })
    ]);

    res.json({
      success: true,
      data: {
        summary: summaryData,
        attendanceGraph: graphData,
        genderDistribution: genderData,
        classes: classesData
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching complete dashboard data",
      error: err.message
    });
  }
};

// ✅ Get attendance + fine records by student for admin/teacher
export const getDashboardRecord = async (req, res) => {
  try {
    const { classId, year, month, date, session } = req.query;
    const user = req.user;

    let classFilterIds = [];

    if (user.role === 'teacher') {
      const teacherClasses = await Class.find({ incharge: user.id }).select('_id');
      classFilterIds = teacherClasses.map(cls => cls._id.toString());

      if (classFilterIds.length === 0) {
        return res.json({ success: true, data: [], filter: { classId, year, month, date, session } });
      }

      if (classId && classId !== 'all') {
        if (!classFilterIds.includes(classId)) {
          return res.status(403).json({ success: false, message: 'Class not assigned to teacher' });
        }
        classFilterIds = [classId];
      }
    } else if (user.role === 'admin') {
      if (classId && classId !== 'all') {
        classFilterIds = [classId];
      } else {
        const allClasses = await Class.find().select('_id');
        classFilterIds = allClasses.map(cls => cls._id.toString());
      }
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized role for dashboard record' });
    }

    // Validate classIds list
    if (classFilterIds.length === 0) {
      return res.json({ success: true, data: [], filter: { classId, year, month, date, session } });
    }

    // Build date filter
    let startDate = null;
    let endDate = null;

    if (session) {
      const sessionDoc = await Session.findById(session);
      if (!sessionDoc) {
        return res.status(400).json({ success: false, message: 'Session not found', session });
      }
      startDate = new Date(sessionDoc.startDate);
      endDate = sessionDoc.endDate ? new Date(sessionDoc.endDate) : new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (date) {
      const parsed = new Date(date);
      if (isNaN(parsed)) {
        return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD)' });
      }
      startDate = new Date(parsed);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(parsed);
      endDate.setHours(23, 59, 59, 999);
    } else if (year && month) {
      const parsedYear = parseInt(year, 10);
      const parsedMonth = parseInt(month, 10);
      if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return res.status(400).json({ success: false, message: 'Invalid month/year' });
      }
      startDate = new Date(parsedYear, parsedMonth - 1, 1);
      endDate = new Date(parsedYear, parsedMonth, 0, 23, 59, 59, 999);
    } else if (year) {
      const parsedYear = parseInt(year, 10);
      if (!Number.isInteger(parsedYear) || parsedYear < 1900) {
        return res.status(400).json({ success: false, message: 'Invalid year' });
      }

      // Academic session from April 1 previous year to March 31 current year (e.g. year=2026 => 2025-04-01 to 2026-03-31)
      const academicStart = new Date(parsedYear - 1, 3, 1);
      const academicEnd = new Date(parsedYear, 2, 31, 23, 59, 59, 999);

      const sessionForYear = await Session.findOne({
        startDate: { $lte: academicEnd },
        $or: [
          { endDate: { $gte: academicStart } },
          { endDate: null },
          { endDate: { $exists: false } }
        ]
      }).sort({ startDate: -1 });

      if (sessionForYear) {
        startDate = new Date(sessionForYear.startDate);
        endDate = sessionForYear.endDate ? new Date(sessionForYear.endDate) : academicEnd;
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = academicStart;
        endDate = academicEnd;
      }
    } else {
      const activeSession = await Session.findOne({
        startDate: { $lte: new Date() },
        $or: [{ endDate: { $gte: new Date() } }, { endDate: null }, { endDate: { $exists: false } }]
      }).sort({ startDate: -1 });

      if (activeSession) {
        startDate = new Date(activeSession.startDate);
        endDate = activeSession.endDate ? new Date(activeSession.endDate) : new Date();
        endDate.setHours(23, 59, 59, 999);
      }
    }

    const classObjectIds = classFilterIds.map(id => new mongoose.Types.ObjectId(id));

    const students = await Student.find({ classId: { $in: classObjectIds } })
      .populate('userId', 'name udise ePunjabId role')
      .populate('classId', 'name section');

    const studentUserIds = students
      .filter(student => student.userId)
      .map(student => student.userId._id);

    // Aggregate attendance counts by student
    const attendanceMatch = {
      classId: { $in: classObjectIds },
      studentId: { $in: studentUserIds }
    };
    if (startDate && endDate) {
      attendanceMatch.date = { $gte: startDate, $lte: endDate };
    }

    const attendanceStats = await Attendance.aggregate([
      { $match: attendanceMatch },
      {
        $group: {
          _id: '$studentId',
          present: {
            $sum: {
              $cond: [{ $eq: ['$status', 'present'] }, 1, 0]
            }
          },
          absent: {
            $sum: {
              $cond: [{ $eq: ['$status', 'absent'] }, 1, 0]
            }
          },
          leave: {
            $sum: {
              $cond: [{ $eq: ['$status', 'leave'] }, 1, 0]
            }
          },
          total: { $sum: 1 }
        }
      }
    ]);

    const attendanceMap = new Map();
    attendanceStats.forEach(stat => {
      attendanceMap.set(stat._id.toString(), {
        present: stat.present,
        absent: stat.absent,
        leave: stat.leave,
        total: stat.total
      });
    });

    // Aggregate fines by student
    const fineMatch = {
      classId: { $in: classObjectIds },
      studentId: { $in: studentUserIds }
    };
    if (startDate && endDate) {
      fineMatch.date = { $gte: startDate, $lte: endDate };
    }

    const fineStats = await Fine.aggregate([
      { $match: fineMatch },
      {
        $group: {
          _id: '$studentId',
          totalFine: { $sum: '$fineAmount' },
          pendingFine: { $sum: '$pendingAmount' },
          paidFine: { $sum: '$paidAmount' }
        }
      }
    ]);

    const fineMap = new Map();
    fineStats.forEach(stat => {
      fineMap.set(stat._id.toString(), {
        totalFine: stat.totalFine,
        pendingFine: stat.pendingFine,
        paidFine: stat.paidFine
      });
    });

    // Build response grouped by class
    const classMap = new Map();

    students.forEach(student => {
      const studentId = student.userId ? student.userId._id.toString() : null;
      if (!studentId) return;

      const classIdStr = student.classId ? student.classId._id.toString() : 'unknown';
      const classKey = classIdStr;

      if (!classMap.has(classKey)) {
        classMap.set(classKey, {
          classId: classIdStr,
          className: student.classId ? `${student.classId.name || ''} ${student.classId.section || ''}`.trim() : 'Unknown',
          students: [],
          totals: {
            present: 0,
            absent: 0,
            leave: 0,
            attendanceTotal: 0,
            totalFine: 0,
            pendingFine: 0,
            paidFine: 0
          }
        });
      }

      const att = attendanceMap.get(studentId) || { present: 0, absent: 0, leave: 0, total: 0 };
      const fine = fineMap.get(studentId) || { totalFine: 0, pendingFine: 0, paidFine: 0 };

      const studentData = {
        studentId,
        studentName: student.userId.name || '',
        udise: student.userId.udise || '',
        ePunjabId: student.userId.ePunjabId || '',
        classId: classIdStr,
        className: student.classId ? student.classId.name : '',
        attendance: {
          present: att.present,
          absent: att.absent,
          leave: att.leave,
          total: att.total
        },
        fine: {
          totalFine: fine.totalFine,
          pendingFine: fine.pendingFine,
          paidFine: fine.paidFine
        }
      };

      const classEntry = classMap.get(classKey);
      classEntry.students.push(studentData);
      classEntry.totals.present += studentData.attendance.present;
      classEntry.totals.absent += studentData.attendance.absent;
      classEntry.totals.leave += studentData.attendance.leave;
      classEntry.totals.attendanceTotal += studentData.attendance.total;
      classEntry.totals.totalFine += studentData.fine.totalFine;
      classEntry.totals.pendingFine += studentData.fine.pendingFine;
      classEntry.totals.paidFine += studentData.fine.paidFine;
    });

    const classes = Array.from(classMap.values());

    res.json({
      success: true,
      data: { classes },
      filter: {
        classId: classId || 'all',
        year: year || null,
        month: month || null,
        date: date || null,
        session: session || null,
        activeSession: !session
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching dashboard record', error: err.message });
  }
};

// Helper functions for complete dashboard
const getDashboardSummaryData = async () => {
  const totalStudents = await User.countDocuments({ role: "student" });
  const totalTeachers = await User.countDocuments({ role: "teacher" });
  const totalClasses = await Class.countDocuments();

  const pendingFinesResult = await Fine.aggregate([
    {
      $group: {
        _id: null,
        totalPendingFines: { $sum: "$pendingAmount" }
      }
    }
  ]);

  return {
    totalStudents,
    totalTeachers,
    totalClasses,
    totalPendingFines: pendingFinesResult[0]?.totalPendingFines || 0
  };
};

const getAttendanceGraphDataInternal = async (classId, month, year) => {
  const currentDate = new Date();
  const currentMonth = month || currentDate.getMonth() + 1;
  const currentYear = year || currentDate.getFullYear();

  const startDate = new Date(currentYear, currentMonth - 1, 1);
  const endDate = new Date(currentYear, currentMonth, 0);

  const attendanceMatchStage = {
    date: { $gte: startDate, $lte: endDate }
  };

  if (classId && classId !== "all") {
    attendanceMatchStage.classId = new mongoose.Types.ObjectId(classId);
  }

  const attendanceStats = await Attendance.aggregate([
    { $match: attendanceMatchStage },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  let present = 0;
  let absent = 0;
  let leave = 0;

  attendanceStats.forEach(stat => {
    switch (stat._id) {
      case "present": present = stat.count; break;
      case "absent": absent = stat.count; break;
      case "leave": leave = stat.count; break;
    }
  });

  const holidaysCount = await Holiday.countDocuments({
    date: { $gte: startDate, $lte: endDate }
  });

  const finesMatchStage = {
    date: { $gte: startDate, $lte: endDate },
    status: { $in: ["pending", "partially_paid"] }
  };

  if (classId && classId !== "all") {
    finesMatchStage.classId = new mongoose.Types.ObjectId(classId);
  }

  const pendingFinesResult = await Fine.aggregate([
    { $match: finesMatchStage },
    {
      $group: {
        _id: null,
        totalPendingAmount: { $sum: "$pendingAmount" },
        totalRecords: { $sum: 1 }
      }
    }
  ]);

  return {
    period: {
      month: parseInt(currentMonth),
      year: parseInt(currentYear),
      classId: classId || "all"
    },
    attendance: {
      present,
      absent,
      leave,
      holidays: holidaysCount,
      total: present + absent + leave
    },
    fines: {
      pendingAmount: pendingFinesResult[0]?.totalPendingAmount || 0,
      pendingRecords: pendingFinesResult[0]?.totalRecords || 0
    }
  };
};

const getGenderDistributionData = async () => {
  const genderStats = await Student.aggregate([
    {
      $group: {
        _id: "$gender",
        count: { $sum: 1 }
      }
    }
  ]);

  let male = 0;
  let female = 0;
  let other = 0;

  genderStats.forEach(stat => {
    switch (stat._id) {
      case "Male": male = stat.count; break;
      case "Female": female = stat.count; break;
      case "Other": other = stat.count; break;
      default: other += stat.count;
    }
  });

  return {
    male,
    female,  
    other,
    total: male + female + other
  };
};


// import User from "../models/User.js";
// import Student from "../models/Student.js";
// import Class from "../models/Class.js";
// import Fine from "../models/Fine.js";
// import Attendance from "../models/Attendance.js";
// import Holiday from "../models/Holiday.js";
// import Session from "../models/Session.js";
// import mongoose from "mongoose";

// // ✅ Get Dashboard Summary (Top 4 Cards)
// export const getDashboardSummary = async (req, res) => {
//   try {
//     // Total Students
//     const totalStudents = await User.countDocuments({ role: "student" });

//     // Total Teachers
//     const totalTeachers = await User.countDocuments({ role: "teacher" });

//     // Total Classes
//     const totalClasses = await Class.countDocuments();

//     // Total Pending Fines (All students across all classes)
//     const pendingFinesResult = await Fine.aggregate([
//       {
//         $group: {
//           _id: null,
//           totalPendingFines: { $sum: "$pendingAmount" }
//         }
//       }
//     ]);

//     const totalPendingFines = pendingFinesResult[0]?.totalPendingFines || 0;

//     res.json({
//       success: true,
//       data: {
//         totalStudents,
//         totalTeachers,
//         totalClasses,
//         totalPendingFines
//       }
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching dashboard summary",
//       error: err.message
//     });
//   }
// };

// // ✅ Get Attendance Graph Data (with filters for class, month, year)
// export const getAttendanceGraphData = async (req, res) => {
//   try {
//     const { classId, month, year } = req.query;

//     // Default to current month and year if not provided
//     const currentDate = new Date();
//     const currentMonth = month || currentDate.getMonth() + 1; // JavaScript months are 0-indexed
//     const currentYear = year || currentDate.getFullYear();

//     // Calculate start and end dates for the month
//     const startDate = new Date(currentYear, currentMonth - 1, 1);
//     const endDate = new Date(currentYear, currentMonth, 0); // Last day of the month

//     // Build match stage for attendance aggregation
//     const attendanceMatchStage = {
//       date: {
//         $gte: startDate,
//         $lte: endDate
//       }
//     };

//     // Add class filter if provided and not "all"
//     if (classId && classId !== "all") {
//       attendanceMatchStage.classId = new mongoose.Types.ObjectId(classId);
//     }

//     // Get attendance statistics
//     const attendanceStats = await Attendance.aggregate([
//       { $match: attendanceMatchStage },
//       {
//         $group: {
//           _id: "$status",
//           count: { $sum: 1 }
//         }
//       }
//     ]);

//     // Initialize counts
//     let present = 0;
//     let absent = 0;
//     let leave = 0;

//     // Process attendance stats
//     attendanceStats.forEach(stat => {
//       switch (stat._id) {
//         case "present":
//           present = stat.count;
//           break;
//         case "absent":
//           absent = stat.count;
//           break;
//         case "leave":
//           leave = stat.count;
//           break;
//       }
//     });

//     // Get holidays count for the month
//     const holidaysCount = await Holiday.countDocuments({
//       date: {
//         $gte: startDate,
//         $lte: endDate
//       }
//     });

//     // Build match stage for fines aggregation
//     const finesMatchStage = {
//       date: {
//         $gte: startDate,
//         $lte: endDate
//       },
//       status: { $in: ["pending", "partially_paid"] }
//     };

//     // Add class filter if provided and not "all"
//     if (classId && classId !== "all") {
//       finesMatchStage.classId = new mongoose.Types.ObjectId(classId);
//     }

//     // Get pending fines for the period
//     const pendingFinesResult = await Fine.aggregate([
//       { $match: finesMatchStage },
//       {
//         $group: {
//           _id: null,
//           totalPendingAmount: { $sum: "$pendingAmount" },
//           totalRecords: { $sum: 1 }
//         }
//       }
//     ]);

//     const pendingFines = pendingFinesResult[0]?.totalPendingAmount || 0;

//     res.json({
//       success: true,
//       data: {
//         period: {
//           month: parseInt(currentMonth),
//           year: parseInt(currentYear),
//           classId: classId || "all"
//         },
//         attendance: {
//           present,
//           absent,
//           leave,
//           holidays: holidaysCount,
//           total: present + absent + leave
//         },
//         fines: {
//           pendingAmount: pendingFines,
//           pendingRecords: pendingFinesResult[0]?.totalRecords || 0
//         }
//       }
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching attendance graph data",
//       error: err.message
//     });
//   }
// };

// // ✅ Get Daily Attendance Graph Data (for a specific date)
// export const getDailyAttendanceGraphData = async (req, res) => {
//   try {
//     const { classId, date } = req.query;

//     // Default to current date if not provided
//     const currentDate = new Date();
//     const targetDate = date ? new Date(date) : currentDate;

//     // Set the date to start of day and end of day
//     const startDate = new Date(targetDate.setHours(0, 0, 0, 0));
//     const endDate = new Date(targetDate.setHours(23, 59, 59, 999));

//     // Build match stage for attendance aggregation
//     const attendanceMatchStage = {
//       date: {
//         $gte: startDate,
//         $lte: endDate
//       }
//     };

//     // Add class filter if provided and not "all"
//     if (classId && classId !== "all") {
//       attendanceMatchStage.classId = new mongoose.Types.ObjectId(classId);
//     }

//     // Get attendance statistics for the day
//     const attendanceStats = await Attendance.aggregate([
//       { $match: attendanceMatchStage },
//       {
//         $group: {
//           _id: "$status",
//           count: { $sum: 1 }
//         }
//       }
//     ]);

//     // Initialize counts
//     let present = 0;
//     let absent = 0;
//     let leave = 0;

//     // Process attendance stats
//     attendanceStats.forEach(stat => {
//       switch (stat._id) {
//         case "present":
//           present = stat.count;
//           break;
//         case "absent":
//           absent = stat.count;
//           break;
//         case "leave":
//           leave = stat.count;
//           break;
//       }
//     });

//     // Check if the day is a holiday
//     const isHoliday = await Holiday.findOne({
//       date: {
//         $gte: startDate,
//         $lte: endDate
//       }
//     });

//     const holidaysCount = isHoliday ? 1 : 0;

//     // Build match stage for fines aggregation (for the day)
//     const finesMatchStage = {
//       date: {
//         $gte: startDate,
//         $lte: endDate
//       },
//       status: { $in: ["pending", "partially_paid"] }
//     };

//     // Add class filter if provided and not "all"
//     if (classId && classId !== "all") {
//       finesMatchStage.classId = new mongoose.Types.ObjectId(classId);
//     }

//     // Get pending fines for the day
//     const pendingFinesResult = await Fine.aggregate([
//       { $match: finesMatchStage },
//       {
//         $group: {
//           _id: null,
//           totalPendingAmount: { $sum: "$pendingAmount" },
//           totalRecords: { $sum: 1 }
//         }
//       }
//     ]);

//     const pendingFines = pendingFinesResult[0]?.totalPendingAmount || 0;

//     res.json({
//       success: true,
//       data: {
//         period: {
//           date: targetDate.toISOString().split('T')[0], // YYYY-MM-DD
//           classId: classId || "all"
//         },
//         attendance: {
//           present,
//           absent,
//           leave,
//           holidays: holidaysCount,
//           total: present + absent + leave
//         },
//         fines: {
//           pendingAmount: pendingFines,
//           pendingRecords: pendingFinesResult[0]?.totalRecords || 0
//         }
//       }
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching daily attendance graph data",
//       error: err.message
//     });
//   }
// };

// // ✅ Get Gender Distribution (Pie Chart)
// export const getGenderDistribution = async (req, res) => {
//   try {
//     const user = req.user;
//     let matchStage = {};

//     // If teacher, filter students by assigned classes
//     if (user && user.role === 'teacher') {
//       // Find all classes assigned to this teacher
//       const teacherClasses = await Class.find({ incharge: user.id }).select('_id');
//       const classIds = teacherClasses.map(cls => cls._id);
//       if (classIds.length > 0) {
//         matchStage.classId = { $in: classIds };
//       } else {
//         // If teacher has no assigned classes, return zeroes
//         return res.json({
//           success: true,
//           data: { male: 0, female: 0, other: 0, total: 0 }
//         });
//       }
//     }

//     const genderStats = await Student.aggregate([
//       { $match: matchStage },
//       {
//         $group: {
//           _id: "$gender",
//           count: { $sum: 1 }
//         }
//       }
//     ]);

//     // Initialize gender counts
//     let male = 0;
//     let female = 0;
//     let other = 0;

//     // Process gender statistics
//     genderStats.forEach(stat => {
//       switch (stat._id) {
//         case "Male":
//           male = stat.count;
//           break;
//         case "Female":
//           female = stat.count;
//           break;
//         case "Other":
//           other = stat.count;
//           break;
//         default:
//           // Handle null or undefined gender
//           other += stat.count;
//       }
//     });

//     const totalStudents = male + female + other;

//     res.json({
//       success: true,
//       data: {
//         male,
//         female,
//         other,
//         total: totalStudents
//       }
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching gender distribution",
//       error: err.message
//     });
//   }
// };

// // ✅ Get All Classes for Dropdown
// export const getAllClasses = async (req, res) => {
//   try {
//       const user = req.user;
//       let teacherId;
//       if(user.role === 'teacher') {
//         teacherId = user.id;
//       }
//       const classes = await Class.find().populate({
//         path: 'incharge'
//       });
  
//       const teacherClasses = classes.filter(cls => {
//         return cls.incharge && cls.incharge._id.toString() === teacherId;
//       });
  
//       if(user.role === 'teacher') {
//         return res.json(teacherClasses);
//       }
  
//       res.json(classes);
//     } catch (err) {
//       res.status(500).json({ message: err.message });
//     }
// };

// // ✅ Get Complete Dashboard Data (All in one)
// export const getCompleteDashboard = async (req, res) => {
//   try {
//     const { classId, month, year } = req.query;

//     // Get all data in parallel for better performance
//     const [
//       summaryData,
//       graphData,
//       genderData,
//       classesData
//     ] = await Promise.all([
//       getDashboardSummaryData(),
//       getAttendanceGraphDataInternal(classId, month, year),
//       getGenderDistributionData(),
//       Class.find().populate('incharge', 'name').select('name section incharge').sort({ name: 1 })
//     ]);

//     res.json({
//       success: true,
//       data: {
//         summary: summaryData,
//         attendanceGraph: graphData,
//         genderDistribution: genderData,
//         classes: classesData
//       }
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching complete dashboard data",
//       error: err.message
//     });
//   }
// };

// // ✅ Get attendance + fine records by student for admin/teacher
// export const getDashboardRecord = async (req, res) => {
//   try {
//     const { classId, year, month, date, session } = req.query;
//     const user = req.user;

//     let classFilterIds = [];

//     if (user.role === 'teacher') {
//       const teacherClasses = await Class.find({ incharge: user.id }).select('_id');
//       classFilterIds = teacherClasses.map(cls => cls._id.toString());

//       if (classFilterIds.length === 0) {
//         return res.json({ success: true, data: [], filter: { classId, year, month, date, session } });
//       }

//       if (classId && classId !== 'all') {
//         if (!classFilterIds.includes(classId)) {
//           return res.status(403).json({ success: false, message: 'Class not assigned to teacher' });
//         }
//         classFilterIds = [classId];
//       }
//     } else if (user.role === 'admin') {
//       if (classId && classId !== 'all') {
//         classFilterIds = [classId];
//       } else {
//         const allClasses = await Class.find().select('_id');
//         classFilterIds = allClasses.map(cls => cls._id.toString());
//       }
//     } else {
//       return res.status(403).json({ success: false, message: 'Unauthorized role for dashboard record' });
//     }

//     // Validate classIds list
//     if (classFilterIds.length === 0) {
//       return res.json({ success: true, data: [], filter: { classId, year, month, date, session } });
//     }

//     // Build date filter
//     let startDate = null;
//     let endDate = null;

//     if (session) {
//       const sessionDoc = await Session.findById(session);
//       if (!sessionDoc) {
//         return res.status(400).json({ success: false, message: 'Session not found', session });
//       }
//       startDate = new Date(sessionDoc.startDate);
//       endDate = sessionDoc.endDate ? new Date(sessionDoc.endDate) : new Date();
//       endDate.setHours(23, 59, 59, 999);
//     } else if (date) {
//       const parsed = new Date(date);
//       if (isNaN(parsed)) {
//         return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD)' });
//       }
//       startDate = new Date(parsed);
//       startDate.setHours(0, 0, 0, 0);
//       endDate = new Date(parsed);
//       endDate.setHours(23, 59, 59, 999);
//     } else if (year && month) {
//       const parsedYear = parseInt(year, 10);
//       const parsedMonth = parseInt(month, 10);
//       if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
//         return res.status(400).json({ success: false, message: 'Invalid month/year' });
//       }
//       startDate = new Date(parsedYear, parsedMonth - 1, 1);
//       endDate = new Date(parsedYear, parsedMonth, 0, 23, 59, 59, 999);
//     } else {
//       const activeSession = await Session.findOne({
//         startDate: { $lte: new Date() },
//         $or: [{ endDate: { $gte: new Date() } }, { endDate: null }, { endDate: { $exists: false } }]
//       }).sort({ startDate: -1 });

//       if (activeSession) {
//         startDate = new Date(activeSession.startDate);
//         endDate = activeSession.endDate ? new Date(activeSession.endDate) : new Date();
//         endDate.setHours(23, 59, 59, 999);
//       }
//     }

//     const classObjectIds = classFilterIds.map(id => new mongoose.Types.ObjectId(id));

//     const students = await Student.find({ classId: { $in: classObjectIds } })
//       .populate('userId', 'name udise ePunjabId role')
//       .populate('classId', 'name section');

//     const studentUserIds = students
//       .filter(student => student.userId)
//       .map(student => student.userId._id);

//     // Aggregate attendance counts by student
//     const attendanceMatch = {
//       classId: { $in: classObjectIds },
//       studentId: { $in: studentUserIds }
//     };
//     if (startDate && endDate) {
//       attendanceMatch.date = { $gte: startDate, $lte: endDate };
//     }

//     const attendanceStats = await Attendance.aggregate([
//       { $match: attendanceMatch },
//       {
//         $group: {
//           _id: '$studentId',
//           present: {
//             $sum: {
//               $cond: [{ $eq: ['$status', 'present'] }, 1, 0]
//             }
//           },
//           absent: {
//             $sum: {
//               $cond: [{ $eq: ['$status', 'absent'] }, 1, 0]
//             }
//           },
//           leave: {
//             $sum: {
//               $cond: [{ $eq: ['$status', 'leave'] }, 1, 0]
//             }
//           },
//           total: { $sum: 1 }
//         }
//       }
//     ]);

//     const attendanceMap = new Map();
//     attendanceStats.forEach(stat => {
//       attendanceMap.set(stat._id.toString(), {
//         present: stat.present,
//         absent: stat.absent,
//         leave: stat.leave,
//         total: stat.total
//       });
//     });

//     // Aggregate fines by student
//     const fineMatch = {
//       classId: { $in: classObjectIds },
//       studentId: { $in: studentUserIds }
//     };
//     if (startDate && endDate) {
//       fineMatch.date = { $gte: startDate, $lte: endDate };
//     }

//     const fineStats = await Fine.aggregate([
//       { $match: fineMatch },
//       {
//         $group: {
//           _id: '$studentId',
//           totalFine: { $sum: '$fineAmount' },
//           pendingFine: { $sum: '$pendingAmount' },
//           paidFine: { $sum: '$paidAmount' }
//         }
//       }
//     ]);

//     const fineMap = new Map();
//     fineStats.forEach(stat => {
//       fineMap.set(stat._id.toString(), {
//         totalFine: stat.totalFine,
//         pendingFine: stat.pendingFine,
//         paidFine: stat.paidFine
//       });
//     });

//     // Build response grouped by class
//     const classMap = new Map();

//     students.forEach(student => {
//       const studentId = student.userId ? student.userId._id.toString() : null;
//       if (!studentId) return;

//       const classIdStr = student.classId ? student.classId._id.toString() : 'unknown';
//       const classKey = classIdStr;

//       if (!classMap.has(classKey)) {
//         classMap.set(classKey, {
//           classId: classIdStr,
//           className: student.classId ? `${student.classId.name || ''} ${student.classId.section || ''}`.trim() : 'Unknown',
//           students: [],
//           totals: {
//             present: 0,
//             absent: 0,
//             leave: 0,
//             attendanceTotal: 0,
//             totalFine: 0,
//             pendingFine: 0,
//             paidFine: 0
//           }
//         });
//       }

//       const att = attendanceMap.get(studentId) || { present: 0, absent: 0, leave: 0, total: 0 };
//       const fine = fineMap.get(studentId) || { totalFine: 0, pendingFine: 0, paidFine: 0 };

//       const studentData = {
//         studentId,
//         studentName: student.userId.name || '',
//         udise: student.userId.udise || '',
//         ePunjabId: student.userId.ePunjabId || '',
//         classId: classIdStr,
//         className: student.classId ? student.classId.name : '',
//         attendance: {
//           present: att.present,
//           absent: att.absent,
//           leave: att.leave,
//           total: att.total
//         },
//         fine: {
//           totalFine: fine.totalFine,
//           pendingFine: fine.pendingFine,
//           paidFine: fine.paidFine
//         }
//       };

//       const classEntry = classMap.get(classKey);
//       classEntry.students.push(studentData);
//       classEntry.totals.present += studentData.attendance.present;
//       classEntry.totals.absent += studentData.attendance.absent;
//       classEntry.totals.leave += studentData.attendance.leave;
//       classEntry.totals.attendanceTotal += studentData.attendance.total;
//       classEntry.totals.totalFine += studentData.fine.totalFine;
//       classEntry.totals.pendingFine += studentData.fine.pendingFine;
//       classEntry.totals.paidFine += studentData.fine.paidFine;
//     });

//     const classes = Array.from(classMap.values());

//     res.json({
//       success: true,
//       data: { classes },
//       filter: {
//         classId: classId || 'all',
//         year: year || null,
//         month: month || null,
//         date: date || null,
//         session: session || null,
//         activeSession: !session
//       }
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: 'Error fetching dashboard record', error: err.message });
//   }
// };

// // Helper functions for complete dashboard
// const getDashboardSummaryData = async () => {
//   const totalStudents = await User.countDocuments({ role: "student" });
//   const totalTeachers = await User.countDocuments({ role: "teacher" });
//   const totalClasses = await Class.countDocuments();

//   const pendingFinesResult = await Fine.aggregate([
//     {
//       $group: {
//         _id: null,
//         totalPendingFines: { $sum: "$pendingAmount" }
//       }
//     }
//   ]);

//   return {
//     totalStudents,
//     totalTeachers,
//     totalClasses,
//     totalPendingFines: pendingFinesResult[0]?.totalPendingFines || 0
//   };
// };

// const getAttendanceGraphDataInternal = async (classId, month, year) => {
//   const currentDate = new Date();
//   const currentMonth = month || currentDate.getMonth() + 1;
//   const currentYear = year || currentDate.getFullYear();

//   const startDate = new Date(currentYear, currentMonth - 1, 1);
//   const endDate = new Date(currentYear, currentMonth, 0);

//   const attendanceMatchStage = {
//     date: { $gte: startDate, $lte: endDate }
//   };

//   if (classId && classId !== "all") {
//     attendanceMatchStage.classId = new mongoose.Types.ObjectId(classId);
//   }

//   const attendanceStats = await Attendance.aggregate([
//     { $match: attendanceMatchStage },
//     {
//       $group: {
//         _id: "$status",
//         count: { $sum: 1 }
//       }
//     }
//   ]);

//   let present = 0;
//   let absent = 0;
//   let leave = 0;

//   attendanceStats.forEach(stat => {
//     switch (stat._id) {
//       case "present": present = stat.count; break;
//       case "absent": absent = stat.count; break;
//       case "leave": leave = stat.count; break;
//     }
//   });

//   const holidaysCount = await Holiday.countDocuments({
//     date: { $gte: startDate, $lte: endDate }
//   });

//   const finesMatchStage = {
//     date: { $gte: startDate, $lte: endDate },
//     status: { $in: ["pending", "partially_paid"] }
//   };

//   if (classId && classId !== "all") {
//     finesMatchStage.classId = new mongoose.Types.ObjectId(classId);
//   }

//   const pendingFinesResult = await Fine.aggregate([
//     { $match: finesMatchStage },
//     {
//       $group: {
//         _id: null,
//         totalPendingAmount: { $sum: "$pendingAmount" },
//         totalRecords: { $sum: 1 }
//       }
//     }
//   ]);

//   return {
//     period: {
//       month: parseInt(currentMonth),
//       year: parseInt(currentYear),
//       classId: classId || "all"
//     },
//     attendance: {
//       present,
//       absent,
//       leave,
//       holidays: holidaysCount,
//       total: present + absent + leave
//     },
//     fines: {
//       pendingAmount: pendingFinesResult[0]?.totalPendingAmount || 0,
//       pendingRecords: pendingFinesResult[0]?.totalRecords || 0
//     }
//   };
// };

// const getGenderDistributionData = async () => {
//   const genderStats = await Student.aggregate([
//     {
//       $group: {
//         _id: "$gender",
//         count: { $sum: 1 }
//       }
//     }
//   ]);

//   let male = 0;
//   let female = 0;
//   let other = 0;

//   genderStats.forEach(stat => {
//     switch (stat._id) {
//       case "Male": male = stat.count; break;
//       case "Female": female = stat.count; break;
//       case "Other": other = stat.count; break;
//       default: other += stat.count;
//     }
//   });

//   return {
//     male,
//     female,  
//     other,
//     total: male + female + other
//   };
// };




