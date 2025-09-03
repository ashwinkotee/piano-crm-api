import { Schema, model, Types, Document } from "mongoose";

export interface GroupDoc extends Document {
  name: string;
  description?: string;
  memberIds: Types.ObjectId[]; // Student IDs
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<GroupDoc>(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "Student", index: true }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<GroupDoc>("Group", GroupSchema);

