import mongoose from 'mongoose';

const ArchivedClassSchema = new mongoose.Schema({
    name: { type: String, required: true },
    section: { type: String },
    incharge: { type: String }, // Store incharge name
    description: { type: String },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('ArchivedClass', ArchivedClassSchema);