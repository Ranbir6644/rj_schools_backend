import Fine from "../models/Fine.js";
import Attendance from "../models/Attendance.js";
import Class from "../models/Class.js";
import User from "../models/User.js";
import mongoose from "mongoose";

// ✅ Create fine for absent student (called from attendance marking)
export const createFineForAbsent = async (attendanceId, studentId, classId, date) => {
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

// ✅ Get fines for a specific class
export const getClassFines = async (req, res) => {
  try {
    const { classId } = req.params;
    const { status, month, year } = req.query; // Add month and year

    if (!classId) {
      return res.status(400).json({ message: "classId is required" });
    }

    // Check if class exists
    const classExists = await Class.findById(classId);
    if (!classExists) {
      return res.status(404).json({ message: "Class not found" });
    }

    const result = await Fine.getClassFines(classId, status, month, year);

    res.json({
      classId,
      status: status || "all",
      month: month || "all",
      year: year || "all",
      ...result
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching class fines", error: err.message });
  }
};

// ✅ Get fine summary for a specific student
export const getStudentFineSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { classId, month, year } = req.query; // Add month and year

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" });
    }

    // Check if student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Pass month and year to the static method
    const fineSummary = await Fine.getStudentFineSummary(studentId, classId, month, year);

    // Get individual fine records with month/year filter
    const query = { studentId };
    if (classId) query.classId = classId;

    // Add month/year filtering to the query
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    const fineRecords = await Fine.find(query)
      .populate('classId', 'name section')
      .sort({ date: -1 });

    res.json({
      student: {
        _id: student._id,
        name: student.name,
        udise: student.udise,
        ePunjabId: student.ePunjabId
      },
      fineSummary,
      fineRecords,
      classId: classId || null,
      month: month || null,
      year: year || null
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching student fine summary", error: err.message });
  }
};

// ✅ Clear complete fine for a student (mark all as paid)
export const clearStudentFine = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { classId, paymentMethod = "cash", remarks = "" } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" });
    }

    // Get all pending fines for the student
    const query = {
      studentId,
      status: { $in: ["pending", "partially_paid"] }
    };

    if (classId) query.classId = classId;

    const pendingFines = await Fine.find(query);

    if (pendingFines.length === 0) {
      return res.status(404).json({ message: "No pending fines found for this student" });
    }

    const paymentDate = new Date();
    const receivedBy = req.user.id;

    // Update each fine record
    for (const fine of pendingFines) {
      const paymentAmount = fine.pendingAmount;

      fine.paidAmount += paymentAmount;
      fine.pendingAmount = 0;
      fine.status = "paid";

      // Add to payment history
      fine.paymentHistory.push({
        paymentDate,
        amount: paymentAmount,
        paymentMethod,
        remarks,
        receivedBy
      });

      await fine.save();
    }

    // Get updated summary
    const updatedSummary = await Fine.getStudentFineSummary(studentId, classId);

    res.json({
      message: `Successfully cleared fines for student. Total amount: Rs.${updatedSummary.totalPending}`,
      updatedSummary,
      clearedFines: pendingFines.length
    });
  } catch (err) {
    res.status(500).json({ message: "Error clearing student fines", error: err.message });
  }
};

// ✅ Update fine balance (partial payment)
export const updateFineBalance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { paymentAmount, paymentMethod = "cash", remarks = "" } = req.body;
    const { classId } = req.query; // Optional: to filter by class

    if (!studentId || !paymentAmount) {
      return res.status(400).json({
        message: "studentId and paymentAmount are required"
      });
    }

    if (paymentAmount <= 0) {
      return res.status(400).json({
        message: "paymentAmount must be greater than 0"
      });
    }

    // Find all pending fines for the student
    const query = {
      studentId,
      status: { $in: ["pending", "partially_paid"] }
    };
    if (classId) query.classId = classId;

    const pendingFines = await Fine.find(query).sort({ date: 1 });
    if (pendingFines.length === 0) {
      return res.status(404).json({ message: "No pending fines found for this student" });
    }

    // Calculate total pending amount
    const totalPendingAmount = pendingFines.reduce((sum, fine) => sum + fine.pendingAmount, 0);
    if (paymentAmount > totalPendingAmount) {
      return res.status(400).json({
        message: `Payment amount (Rs.${paymentAmount}) exceeds total pending amount (Rs.${totalPendingAmount})`
      });
    }

    const paymentDate = new Date();
    const receivedBy = req.user.id;
    let remainingPayment = paymentAmount;
    const updatedFines = [];

    // Update fines one by one until payment is fully allocated
    for (const fine of pendingFines) {
      if (remainingPayment <= 0) break;

      const paymentForThisFine = Math.min(remainingPayment, fine.pendingAmount);

      // Update fine
      fine.paidAmount += paymentForThisFine;
      fine.pendingAmount = fine.fineAmount - fine.paidAmount;
      remainingPayment -= paymentForThisFine;

      if (fine.pendingAmount === 0) {
        fine.status = "paid";
      } else {
        fine.status = "partially_paid";
      }

      // Add to payment history
      fine.paymentHistory.push({
        paymentDate,
        amount: paymentForThisFine,
        paymentMethod,
        remarks,
        receivedBy
      });

      const updatedFine = await fine.save();
      await updatedFine.populate([
        { path: 'studentId', select: 'name udise ePunjabId' },
        { path: 'classId', select: 'name section' }
      ]);
      updatedFines.push(updatedFine);
    }

    // Get updated totals
    const updatedTotals = {
      totalFineAmount: updatedFines.reduce((sum, fine) => sum + fine.fineAmount, 0),
      totalPaidAmount: updatedFines.reduce((sum, fine) => sum + fine.paidAmount, 0),
      totalPendingAmount: updatedFines.reduce((sum, fine) => sum + fine.pendingAmount, 0),
    };

    res.json({
      message: `Payment of Rs.${paymentAmount} applied successfully`,
      student: updatedFines[0].studentId,
      updatedFines,
      totals: updatedTotals
    });
  } catch (err) {
    res.status(500).json({ message: "Error updating fine balance", error: err.message });
  }
};

// ✅ Get fine payment history
export const getFinePaymentHistory = async (req, res) => {
  try {
    const { fineId } = req.params;

    const fine = await Fine.findById(fineId).populate([
      { path: 'studentId', select: 'name udise ePunjabId' },
      { path: 'paymentHistory.receivedBy', select: 'name role' }
    ]);

    if (!fine) {
      return res.status(404).json({ message: "Fine record not found" });
    }

    res.json({
      fineId: fine._id,
      student: fine.studentId,
      totalFine: fine.fineAmount,
      paidAmount: fine.paidAmount,
      pendingAmount: fine.pendingAmount,
      status: fine.status,
      paymentHistory: fine.paymentHistory
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching payment history", error: err.message });
  }
};

// ✅ Sync fines from attendance (utility function)
export const syncFinesFromAttendance = async (req, res) => {
  try {
    const { classId, startDate, endDate } = req.body;

    // Find all absent attendance records
    const query = {
      status: "absent",
      fineAmount: { $gt: 0 }
    };

    if (classId) query.classId = classId;
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const absentRecords = await Attendance.find(query);

    let createdCount = 0;
    let updatedCount = 0;

    for (const attendance of absentRecords) {
      // Check if fine already exists
      const existingFine = await Fine.findOne({ attendanceId: attendance._id });

      if (!existingFine) {
        await createFineForAbsent(
          attendance._id,
          attendance.studentId,
          attendance.classId,
          attendance.date
        );
        createdCount++;
      } else {
        // Update existing fine if needed
        if (existingFine.fineAmount !== attendance.fineAmount) {
          existingFine.fineAmount = attendance.fineAmount;
          existingFine.pendingAmount = attendance.fineAmount - existingFine.paidAmount;
          await existingFine.save();
          updatedCount++;
        }
      }
    }

    res.json({
      message: "Fines synced successfully",
      stats: {
        totalAbsentRecords: absentRecords.length,
        finesCreated: createdCount,
        finesUpdated: updatedCount,
        existingFines: absentRecords.length - createdCount
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error syncing fines", error: err.message });
  }
};

// ✅ Get all classes fines list with summary
export const getAllClassesFines = async (req, res) => {
  try {
    const { status, month, year } = req.query;

    const user = req.user;
    let teacherId;
    if (user.role === 'teacher') {
      teacherId = user.id;
    }
    // Build match stage for fines
    const matchStage = {};

    // Filter by status if provided
    if (status && status !== 'all') {
      matchStage.status = status;
    }

    // Filter by month and year if provided
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      matchStage.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    // Aggregate to get fines by class with student details
    const classFines = await Fine.aggregate([
      {
        $match: matchStage
      },
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "_id",
          as: "class"
        }
      },
      {
        $unwind: "$class"
      },
      {
        $match: teacherId ? { "class.incharge": new mongoose.Types.ObjectId(teacherId) } : {}
      },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      {
        $unwind: "$student"
      },
      {
        $group: {
          _id: "$classId",
          className: { $first: "$class.name" },
          classSection: { $first: "$class.section" },
          classIncharge: { $first: "$class.incharge" },
          totalStudentsWithFines: { $addToSet: "$studentId" },
          totalFineAmount: { $sum: "$fineAmount" },
          totalPaidAmount: { $sum: "$paidAmount" },
          totalPendingAmount: { $sum: "$pendingAmount" },
          totalRecords: { $sum: 1 },
          pendingRecords: {
            $sum: {
              $cond: [{ $in: ["$status", ["pending", "partially_paid"]] }, 1, 0]
            }
          },
          paidRecords: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, 1, 0]
            }
          },
          studentFines: {
            $push: {
              _id: "$studentId",
              name: "$student.name",
              udise: "$student.udise",
              ePunjabId: "$student.ePunjabId",
              totalFineAmount: "$fineAmount",
              totalPaidAmount: "$paidAmount",
              totalPendingAmount: "$pendingAmount",
              fineDetails: {
                fineId: "$_id",
                date: "$date",
                amount: "$fineAmount",
                paid: "$paidAmount",
                pending: "$pendingAmount",
                status: "$status",
                attendanceId: "$attendanceId"
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          classId: "$_id",
          className: 1,
          classSection: 1,
          classIncharge: 1,
          totalStudentsWithFines: { $size: "$totalStudentsWithFines" },
          totalFineAmount: 1,
          totalPaidAmount: 1,
          totalPendingAmount: 1,
          totalRecords: 1,
          pendingRecords: 1,
          paidRecords: 1,
          studentFines: 1
        }
      },
      {
        $unwind: "$studentFines"
      },
      {
        $group: {
          _id: {
            classId: "$classId",
            studentId: "$studentFines._id"
          },
          className: { $first: "$className" },
          classSection: { $first: "$classSection" },
          classIncharge: { $first: "$classIncharge" },
          studentInfo: { $first: "$studentFines" },
          fineDetails: { $push: "$studentFines.fineDetails" },
          totalFineAmount: { $sum: "$studentFines.totalFineAmount" },
          totalPaidAmount: { $sum: "$studentFines.totalPaidAmount" },
          totalPendingAmount: { $sum: "$studentFines.totalPendingAmount" }
        }
      },
      {
        $group: {
          _id: "$_id.classId",
          className: { $first: "$className" },
          classSection: { $first: "$classSection" },
          classIncharge: { $first: "$classIncharge" },
          totalStudentsWithFines: { $sum: 1 },
          totalFineAmount: { $sum: "$totalFineAmount" },
          totalPaidAmount: { $sum: "$totalPaidAmount" },
          totalPendingAmount: { $sum: "$totalPendingAmount" },
          totalRecords: { $sum: { $size: "$fineDetails" } },
          pendingRecords: {
            $sum: {
              $size: {
                $filter: {
                  input: "$fineDetails",
                  as: "fine",
                  cond: { $in: ["$$fine.status", ["pending", "partially_paid"]] }
                }
              }
            }
          },
          paidRecords: {
            $sum: {
              $size: {
                $filter: {
                  input: "$fineDetails",
                  as: "fine",
                  cond: { $eq: ["$$fine.status", "paid"] }
                }
              }
            }
          },
          students: {
            $push: {
              _id: "$studentInfo._id",
              name: "$studentInfo.name",
              udise: "$studentInfo.udise",
              ePunjabId: "$studentInfo.ePunjabId",
              totalFineAmount: "$totalFineAmount",
              totalPaidAmount: "$totalPaidAmount",
              totalPendingAmount: "$totalPendingAmount",
              fineDetails: "$fineDetails"
            }
          }
        }
      },
      {
        $sort: { className: 1, classSection: 1 }
      }
    ]);

    // Calculate overall totals
    const overallTotals = classFines.reduce((acc, classFine) => ({
      totalClasses: acc.totalClasses + 1,
      totalStudentsWithFines: acc.totalStudentsWithFines + classFine.totalStudentsWithFines,
      totalFineAmount: acc.totalFineAmount + classFine.totalFineAmount,
      totalPaidAmount: acc.totalPaidAmount + classFine.totalPaidAmount,
      totalPendingAmount: acc.totalPendingAmount + classFine.totalPendingAmount,
      totalRecords: acc.totalRecords + classFine.totalRecords,
      totalPendingRecords: acc.totalPendingRecords + classFine.pendingRecords,
      totalPaidRecords: acc.totalPaidRecords + classFine.paidRecords
    }), {
      totalClasses: 0,
      totalStudentsWithFines: 0,
      totalFineAmount: 0,
      totalPaidAmount: 0,
      totalPendingAmount: 0,
      totalRecords: 0,
      totalPendingRecords: 0,
      totalPaidRecords: 0
    });

    // Populate class incharge names
    const populatedClassFines = await Promise.all(
      classFines.map(async (classFine) => {
        if (classFine.classIncharge) {
          const incharge = await User.findById(classFine.classIncharge).select('name email');
          return {
            ...classFine,
            classIncharge: incharge || null
          };
        }
        return classFine;
      })
    );

    res.json({
      success: true,
      data: {
        filters: {
          status: status || 'all',
          month: month || 'all',
          year: year || 'all'
        },
        summary: overallTotals,
        classes: populatedClassFines
      }
    });

  } catch (err) {
    console.error("Error in getAllClassesFines:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching all classes fines",
      error: err.message
    });
  }
};  
