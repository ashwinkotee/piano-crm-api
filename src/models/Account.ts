import { Schema, model, Types } from "mongoose";

const accountSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", index: true },
    provider: { type: String, enum: ["google", "email"], required: true },
    providerId: { type: String, index: true },
  },
  { timestamps: true }
);
export default model("Account", accountSchema);
