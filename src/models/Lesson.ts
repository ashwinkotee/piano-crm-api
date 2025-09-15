import { Schema, model, Types, Document } from "mongoose";

export type LessonStatus = "Scheduled" | "Cancelled" | "Completed";
export type LessonType   = "one" | "group" | "demo";

export interface LessonDoc extends Document {
  studentId?: Types.ObjectId; // optional for demo lessons
  type: LessonType;
  start: Date;
  end: Date;
  status: LessonStatus;
  notes?: string;
  groupId?: Types.ObjectId; // optional: link to a Group for group sessions
  demoName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<LessonDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: false, index: true },
    type: { type: String, enum: ["one","group","demo"], required: true },
    start: { type: Date, required: true, index: true },
    end:   { type: Date, required: true },
    status:{ type: String, enum: ["Scheduled","Cancelled","Completed"], default: "Scheduled", index: true },
    notes: { type: String },
    groupId: { type: Schema.Types.ObjectId, ref: "Group" },
    demoName: { type: String },
  },
  { timestamps: true }
);

export default model<LessonDoc>("Lesson", LessonSchema);
