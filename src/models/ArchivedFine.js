import mongoose from 'mongoose';

const ArchivedFineSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArchivedStudent',
    required: true,
    index: true,
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArchivedClass',
    required: true,
    index: true,
  },
  attendanceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
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
    default: 50,
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
    enum: ['pending', 'partially_paid', 'paid'],
    default: 'pending',
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
      enum: ['cash', 'online', 'cheque'],
      default: 'cash',
    },
    remarks: String,
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
    }
  }],
  remarks: {
    type: String,
    default: '',
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

export default mongoose.model('ArchivedFine', ArchivedFineSchema);