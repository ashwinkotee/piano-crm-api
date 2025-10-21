import { Document, Schema, model, Types } from "mongoose";

export interface NotificationLogDoc extends Document {
  subscriptionId: Types.ObjectId;
  lessonId: Types.ObjectId;
  kind: "lesson-reminder";
  sentAt: Date;
}

const NotificationLogSchema = new Schema<NotificationLogDoc>(
  {
    subscriptionId: { type: Schema.Types.ObjectId, ref: "PushSubscription", required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    kind: { type: String, enum: ["lesson-reminder"], required: true },
    sentAt: { type: Date, default: () => new Date(), required: true },
  },
  { timestamps: false }
);

NotificationLogSchema.index({ subscriptionId: 1, lessonId: 1, kind: 1 }, { unique: true });

export default model<NotificationLogDoc>("NotificationLog", NotificationLogSchema);
