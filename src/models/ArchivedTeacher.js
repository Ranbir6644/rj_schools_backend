import mongoose from 'mongoose';

const ArchivedTeacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  employeeId: { type: String, required: true },
  udise: { type: String, required: true },
  ePunjabId: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('ArchivedTeacher', ArchivedTeacherSchema);