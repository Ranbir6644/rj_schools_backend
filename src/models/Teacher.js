import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One teacher profile per user
    },
    dob: { type: Date },
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    phone: { type: String },

    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },

    qualification: { type: String },
    experience: { type: String },
    availability: { type: String }, // e.g. "Full-time", "Part-time"
    subjects: [{ type: String }],   // ["Math", "Science"]
    joining: { type: Date },
    about: { type: String },

    // udise: { type: String },
    // ePunjabId: { type: String },

    photo: { type: String },
    photoPublicId: { type: String },

    resume: { type: String },
    resumePublicId: { type: String },

    lastSchool: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Teacher", teacherSchema);
