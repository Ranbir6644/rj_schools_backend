import Fine from "../models/Fine.js";
import Attendance from "../models/Attendance.js";
import Class from "../models/Class.js";
import User from "../models/User.js";

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
    const { status } = req.query; // optional: pending, partially_paid, paid

    if (!classId) {
      return res.status(400).json({ message: "classId is required" });
    }

    // Check if class exists
    const classExists = await Class.findById(classId);
    if (!classExists) {
      return res.status(404).json({ message: "Class not found" });
    }

    const result = await Fine.getClassFines(classId, status);

    res.json({
      classId,
      status: status || "all",
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
    const { classId } = req.query;

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" });
    }

    // Check if student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const fineSummary = await Fine.getStudentFineSummary(studentId, classId);

    // Get individual fine records
    const query = { studentId };
    if (classId) query.classId = classId;

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
      classId: classId || null
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
    const { fineId } = req.params;
    const { paymentAmount, paymentMethod = "cash", remarks = "" } = req.body;

    if (!fineId || !paymentAmount) {
      return res.status(400).json({ 
        message: "fineId and paymentAmount are required" 
      });
    }

    if (paymentAmount <= 0) {
      return res.status(400).json({ 
        message: "paymentAmount must be greater than 0" 
      });
    }

    const fine = await Fine.findById(fineId);
    if (!fine) {
      return res.status(404).json({ message: "Fine record not found" });
    }

    if (fine.status === "paid") {
      return res.status(400).json({ message: "Fine is already fully paid" });
    }

    if (paymentAmount > fine.pendingAmount) {
      return res.status(400).json({ 
        message: `Payment amount (Rs.${paymentAmount}) exceeds pending amount (Rs.${fine.pendingAmount})` 
      });
    }

    const paymentDate = new Date();
    const receivedBy = req.user.id;

    // Update fine
    fine.paidAmount += paymentAmount;
    fine.pendingAmount = fine.fineAmount - fine.paidAmount;
    
    if (fine.pendingAmount === 0) {
      fine.status = "paid";
    } else {
      fine.status = "partially_paid";
    }

    // Add to payment history
    fine.paymentHistory.push({
      paymentDate,
      amount: paymentAmount,
      paymentMethod,
      remarks,
      receivedBy
    });

    const updatedFine = await fine.save();
    await updatedFine.populate([
      { path: 'studentId', select: 'name udise ePunjabId' },
      { path: 'classId', select: 'name section' }
    ]);

    res.json({
      message: `Payment of Rs.${paymentAmount} applied successfully`,
      fine: updatedFine,
      remainingBalance: updatedFine.pendingAmount
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