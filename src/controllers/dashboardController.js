import User from "../models/User.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import Fine from "../models/Fine.js";
import Attendance from "../models/Attendance.js";
import Holiday from "../models/Holiday.js";
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

// ✅ Get Gender Distribution (Pie Chart)
export const getGenderDistribution = async (req, res) => {
  try {
    const genderStats = await Student.aggregate([
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
    const classes = await Class.find()
      .populate('incharge', 'name')
      .select('name section incharge')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: classes
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Error fetching classes", 
      error: err.message 
    });
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