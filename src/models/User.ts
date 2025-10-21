import { Schema, model, Document } from "mongoose";

export type UserRole = "admin" | "portal";

export interface UserDoc extends Document {
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  profile?: { name?: string };
  preferences?: {
    lessonReminders?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, unique: true, required: true, trim: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "portal"], required: true, index: true },
    active: { type: Boolean, default: true },
    // Force first login to change temp password
    mustChangePassword: { type: Boolean, default: false },
    profile: {
      name: { type: String },
    },
    preferences: {
      lessonReminders: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

export default model<UserDoc>("User", UserSchema);

