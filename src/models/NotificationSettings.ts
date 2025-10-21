import { Document, Schema, model } from "mongoose";

export interface NotificationSettingsDoc extends Document {
  _id: string;
  enabled: boolean;
  leadMinutes: number;
  quietHours: { start: number; end: number };
  updatedAt: Date;
  createdAt: Date;
}

const NotificationSettingsSchema = new Schema<NotificationSettingsDoc>(
  {
    _id: { type: String, default: "notifications" },
    enabled: { type: Boolean, default: true },
    leadMinutes: { type: Number, default: 24 * 60 },
    quietHours: {
      start: { type: Number, min: 0, max: 23, default: 22 },
      end: { type: Number, min: 0, max: 23, default: 7 },
    },
  },
  { timestamps: true, collection: "notification_settings" }
);

export default model<NotificationSettingsDoc>("NotificationSettings", NotificationSettingsSchema);
