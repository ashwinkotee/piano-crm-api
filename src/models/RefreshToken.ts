import { Schema, model, Types } from "mongoose";

const schema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", index: true },
    token: { type: String, index: true }, // for prod: store a hash
    revokedAt: Date,
  },
  { timestamps: true }
);
export default model("RefreshToken", schema);
