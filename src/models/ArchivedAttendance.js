import mongoose from "mongoose";

const ArchivedAttendanceSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ArchivedClass",
    required: true,
    index: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArchivedStudent',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["present", "absent", "leave"],
    required: true,
    default: "present",
  },
  takenBy: {
    type: mongoose.Schema.Types.ObjectId,
  },
  remarks: {
    type: String,
    default: "",
  },
  checkInTime: {
    type: String,
  },
  checkOutTime: {
    type: String,
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
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('ArchivedAttendance', ArchivedAttendanceSchema);