import { Schema, model, Types, Document } from "mongoose";

export type HomeworkStatus = "Assigned" | "Completed";

export interface HomeworkDoc extends Document {
  studentId: Types.ObjectId;
  text: string;
  status: HomeworkStatus;
  createdAt: Date;
  updatedAt: Date;
}

const HomeworkSchema = new Schema<HomeworkDoc>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    text: { type: String, required: true },
    status: { type: String, enum: ["Assigned", "Completed"], default: "Assigned", index: true },
  },
  { timestamps: true }
);

export default model<HomeworkDoc>("Homework", HomeworkSchema);

