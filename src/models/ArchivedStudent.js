import mongoose from 'mongoose';

const ArchivedStudentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  rollNumber: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('ArchivedStudent', ArchivedStudentSchema);