import mongoose from "mongoose";

const studentDetailsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // links student to User collection
      required: true,
      unique: true,
    },
    admissionDate: { type: Date, required: true },
    aadharNo: { type: String },
    dob: { type: Date },
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    category: { type: String },

    fatherName: { type: String },
    motherName: { type: String },
    fatherOccupation: { type: String },
    motherOccupation: { type: String },
    fatherIncome: { type: Number },
    motherIncome: { type: Number },
    fatherMobile: { type: String },
    motherMobile: { type: String },
    fatherAadharNo: { type: String },
    motherAadharNo: { type: String },

    sibling1: { type: String },
    sibling2: { type: String },
    sibling3: { type: String },

    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },

    pickup1: { type: String },
    pickup1_relationship: { type: String },
    pickup1_Aadhar: { type: String },
    pickup1_mobile: { type: String },

    pickup2: { type: String },
    pickup2_relationship: { type: String },
    pickup2_Aadhar: { type: String },
    pickup2_mobile: { type: String },

    other_pickup: { type: String },

    impInfo1: { type: String },
    impInfo2: { type: String },
    impInfo3: { type: String },
    impInfo4: { type: String },

    studentImg: { type: String },
    studentImgPublicId: { type: String }, // ✅ add this

    fatherImg: { type: String },
    fatherImgPublicId: { type: String },

    motherImg: { type: String },
    motherImgPublicId: { type: String },

    signature: { type: String },
    signaturePublicId: { type: String },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class", // links to classes collection
      required: true,
    },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("StudentDetails", studentDetailsSchema);
