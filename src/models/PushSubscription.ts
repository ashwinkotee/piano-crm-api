import { Document, Schema, model, Types } from "mongoose";

export interface PushSubscriptionDoc extends Document {
  userId: Types.ObjectId;
  endpoint: string;
  subscription: Record<string, unknown>;
  platform?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt?: Date;
}

const PushSubscriptionSchema = new Schema<PushSubscriptionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    subscription: { type: Schema.Types.Mixed, required: true },
    platform: { type: String },
    userAgent: { type: String },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

export default model<PushSubscriptionDoc>("PushSubscription", PushSubscriptionSchema);
