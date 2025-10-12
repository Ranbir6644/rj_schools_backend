import mongoose from "mongoose";

const fineSchema = new mongoose.Schema(
    {
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        classId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            required: true,
            index: true,
        },
        attendanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Attendance",
            required: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        fineAmount: {
            type: Number,
            required: true,
            min: 0,
            default: 50, // Rs.50 per absent day
        },
        paidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        pendingAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        status: {
            type: String,
            enum: ["pending", "partially_paid", "paid"],
            default: "pending",
        },
        paymentHistory: [{
            paymentDate: {
                type: Date,
                default: Date.now,
            },
            amount: {
                type: Number,
                required: true,
                min: 0,
            },
            paymentMethod: {
                type: String,
                enum: ["cash", "online", "cheque"],
                default: "cash",
            },
            remarks: String,
            receivedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            }
        }],
        remarks: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

// Compound index
fineSchema.index({ studentId: 1, classId: 1, date: 1 }, { unique: true });

// Virtual for calculating pending amount
fineSchema.virtual('calculatedPending').get(function () {
    return this.fineAmount - this.paidAmount;
});

// Pre-save middleware to update pending amount and status
fineSchema.pre('save', function (next) {
    this.pendingAmount = this.fineAmount - this.paidAmount;

    if (this.paidAmount === 0) {
        this.status = "pending";
    } else if (this.paidAmount < this.fineAmount) {
        this.status = "partially_paid";
    } else {
        this.status = "paid";
    }

    next();
});

// Static method to get student fine summary - FIXED
fineSchema.statics.getStudentFineSummary = async function (studentId, classId = null) {
    const matchStage = { studentId: new mongoose.Types.ObjectId(studentId) }; // ✅ ADDED 'new'

    if (classId) {
        matchStage.classId = new mongoose.Types.ObjectId(classId);
    }

    const result = await this.aggregate([
        {
            $match: matchStage
        },
        {
            $group: {
                _id: "$studentId",
                totalFine: { $sum: "$fineAmount" },
                totalPaid: { $sum: "$paidAmount" },
                totalPending: { $sum: "$pendingAmount" },
                totalRecords: { $sum: 1 },
                pendingRecords: {
                    $sum: {
                        $cond: [{ $ne: ["$status", "paid"] }, 1, 0]
                    }
                },
                paidRecords: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "paid"] }, 1, 0]
                    }
                }
            }
        }
    ]);

    return result[0] || {
        totalFine: 0,
        totalPaid: 0,
        totalPending: 0,
        totalRecords: 0,
        pendingRecords: 0,
        paidRecords: 0
    };
};

// Static method to get class fines - FIXED
fineSchema.statics.getClassFines = async function (classId, status = null) {
    const matchStage = { classId: new mongoose.Types.ObjectId(classId) };

    if (status) {
        matchStage.status = status;
    }

    const fines = await this.aggregate([
        {
            $match: matchStage
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
                _id: "$studentId",
                studentName: { $first: "$student.name" },
                studentUdise: { $first: "$student.udise" },
                studentEPunjabId: { $first: "$student.ePunjabId" },
                totalFine: { $sum: "$fineAmount" },
                totalPaid: { $sum: "$paidAmount" },
                totalPending: { $sum: "$pendingAmount" },
                fineRecords: {
                    $push: {
                        fineId: "$_id",
                        date: "$date",
                        fineAmount: "$fineAmount",
                        paidAmount: "$paidAmount",
                        pendingAmount: "$pendingAmount",
                        status: "$status",
                        attendanceId: "$attendanceId"
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                studentId: "$_id",
                studentName: 1,
                studentUdise: 1,
                studentEPunjabId: 1,
                totalFine: 1,
                totalPaid: 1,
                totalPending: 1,
                fineRecords: 1
            }
        }
    ]);

    // Calculate class totals
    const classTotals = fines.reduce((acc, student) => ({
        totalFine: acc.totalFine + student.totalFine,
        totalPaid: acc.totalPaid + student.totalPaid,
        totalPending: acc.totalPending + student.totalPending,
        totalStudents: acc.totalStudents + 1
    }), {
        totalFine: 0,
        totalPaid: 0,
        totalPending: 0,
        totalStudents: 0
    });

    return {
        fines,
        classTotals
    };
};

export default mongoose.model("Fine", fineSchema);