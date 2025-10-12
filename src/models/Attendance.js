import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true, // Add index for better query performance
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to User since students are users with role 'student'
      required: true,
      index: true, // Add index for better query performance
    },
    date: {
      type: Date,
      required: true,
      index: true, // Add index for better query performance
    },
    status: {
      type: String,
      enum: ["present", "absent", "leave"],
      required: true,
      default: "present",
    },
    takenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Reference to the user (teacher/admin) who marked attendance
      required: true,
    },
    remarks: {
      type: String, // Optional field for any additional notes
      default: "",
    },
    checkInTime: {
      type: String, // Time when student checked in (optional)
    },
    checkOutTime: {
      type: String, // Time when student checked out (optional)
    },

    fineAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    finePaid: {
      type: Boolean,
      default: false,
    },
    finePaidDate: {
      type: Date,
    },
    fineRemarks: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true // Automatically adds createdAt and updatedAt fields
  }
);

// Compound index to ensure one attendance record per student per day
attendanceSchema.index({ studentId: 1, date: 1, classId: 1 }, { unique: true });

// Virtual for formatting date
attendanceSchema.virtual('formattedDate').get(function () {
  return this.date.toISOString().split('T')[0];
});

// ✅ Method to calculate and set fine automatically when status changes
attendanceSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === 'absent') {
      this.fineAmount = 50; // Rs.50 fine for absent students
    } else {
      this.fineAmount = 0;
      this.finePaid = false;
      this.finePaidDate = undefined;
    }
  }
  next();
});

// Method to check if attendance is already marked
attendanceSchema.statics.isAttendanceMarked = async function (studentId, date, classId) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const attendance = await this.findOne({
    studentId,
    classId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  });
  return !!attendance;
};

// Method to get attendance summary for a class on a specific date
attendanceSchema.statics.getClassAttendanceSummary = async function (classId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const attendance = await this.aggregate([
    {
      $match: {
        classId: mongoose.Types.ObjectId(classId),
        date: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const summary = {
    present: 0,
    absent: 0,
    leave: 0,
    total: 0
  };

  attendance.forEach(item => {
    summary[item._id] = item.count;
    summary.total += item.count;
  });

  return summary;
};



// ✅ Method to get total fine for a student in a date range
attendanceSchema.statics.getStudentFineSummary = async function (studentId, startDate, endDate) {
  const matchStage = {
    studentId: mongoose.Types.ObjectId(studentId),
    status: 'absent'
  };

  if (startDate && endDate) {
    matchStage.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const result = await this.aggregate([
    {
      $match: matchStage
    },
    {
      $group: {
        _id: '$studentId',
        totalFine: { $sum: '$fineAmount' },
        paidFine: {
          $sum: {
            $cond: [{ $eq: ['$finePaid', true] }, '$fineAmount', 0]
          }
        },
        pendingFine: {
          $sum: {
            $cond: [{ $eq: ['$finePaid', false] }, '$fineAmount', 0]
          }
        },
        absentDays: { $sum: 1 },
        paidDays: {
          $sum: {
            $cond: [{ $eq: ['$finePaid', true] }, 1, 0]
          }
        },
        pendingDays: {
          $sum: {
            $cond: [{ $eq: ['$finePaid', false] }, 1, 0]
          }
        }
      }
    }
  ]);

  return result[0] || {
    totalFine: 0,
    paidFine: 0,
    pendingFine: 0,
    absentDays: 0,
    paidDays: 0,
    pendingDays: 0
  };
};

export default mongoose.model("Attendance", attendanceSchema);