import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    section: { type: String },
    incharge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

classSchema.index({ name: 1, section: 1 }, { unique: true });

export default mongoose.model("Class", classSchema);
