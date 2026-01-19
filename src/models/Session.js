import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Session', SessionSchema);