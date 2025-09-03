import { Schema, model, Types, Document } from "mongoose";

export type LessonStatus = "Scheduled" | "Cancelled" | "Completed";
export type LessonType   = "one" | "group";

export interface LessonDoc extends Document {
  studentId: Types.ObjectId;
  type: LessonType;
  start: Date;
  end: Date;
  status: LessonStatus;
  notes?: string;
  groupId?: Types.ObjectId; // optional: link to a Group for group sessions
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<LessonDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    type: { type: String, enum: ["one","group"], required: true },
    start: { type: Date, required: true, index: true },
    end:   { type: Date, required: true },
    status:{ type: String, enum: ["Scheduled","Cancelled","Completed"], default: "Scheduled", index: true },
    notes: { type: String },
    groupId: { type: Schema.Types.ObjectId, ref: "Group" },
  },
  { timestamps: true }
);

export default model<LessonDoc>("Lesson", LessonSchema);
