import { Schema, model, Types, Document } from "mongoose";

export type Program = "One-on-one" | "Group";
export type AgeGroup = "6-9" | "10-14" | "15+";

export interface StudentDoc extends Document {
  name: string;
  address?: string;
  dateOfBirth?: Date;
  parentName?: string;
  parentPhone?: string;
  program: Program;
  ageGroup?: AgeGroup;
  monthlyFee: number;
  active: boolean;
  timezone?: string;
  // ?? link to portal user
  userId: Types.ObjectId;
  // Terms & Conditions acceptance
  termsAccepted?: boolean;
  termsAcceptedAt?: Date;
  // default weekly slot for month generation
  defaultSlot?: {
    weekday: number; // 0=Sun..6=Sat
    time: string;    // "HH:mm"
  };
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<StudentDoc>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String },
    dateOfBirth: { type: Date },
    parentName: { type: String },
    parentPhone: { type: String },
    program: { type: String, enum: ["One-on-one", "Group"], required: true },
    ageGroup: { type: String, enum: ["6-9", "10-14", "15+"] },
    monthlyFee: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    timezone: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date },
    defaultSlot: {
      weekday: { type: Number, min: 0, max: 6 },
      time: { type: String }, // "HH:mm"
    },
  },
  { timestamps: true }
);

export default model<StudentDoc>("Student", StudentSchema);

