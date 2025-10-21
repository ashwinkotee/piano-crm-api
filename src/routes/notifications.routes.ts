import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import PushSubscription from "../models/PushSubscription";
import NotificationSettings from "../models/NotificationSettings";
import User from "../models/User";

const r = Router();

const SubscriptionSchema = z.object({
  subscription: z
    .object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string(),
        auth: z.string(),
      }),
      expirationTime: z.number().nullable().optional(),
    })
    .passthrough(),
  platform: z.string().optional(),
  userAgent: z.string().optional(),
});

r.post("/subscribe", requireAuth(["portal"]), async (req, res) => {
  const payload = SubscriptionSchema.safeParse(req.body);
  if (!payload.success) {
    res.status(400).json({ error: "Invalid subscription payload" });
    return;
  }
  const { subscription, platform, userAgent } = payload.data;
  const userId = (req as any).user.sub;
  try {
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          subscription,
          platform,
          userAgent,
          lastSeenAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await User.updateOne(
      { _id: userId },
      { $set: { "preferences.lessonReminders": true } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to save push subscription", err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

r.post("/unsubscribe", requireAuth(["portal"]), async (req, res) => {
  const schema = z.object({
    endpoint: z.string().url(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = (req as any).user.sub;
  await PushSubscription.deleteOne({ endpoint: parsed.data.endpoint, userId });
  res.json({ ok: true });
});

r.get("/preferences", requireAuth(["portal"]), async (req, res) => {
  const userId = (req as any).user.sub;
  const user = await User.findById(userId, { preferences: 1 }).lean();
  res.json({
    lessonReminders: user?.preferences?.lessonReminders !== false,
  });
});

r.put("/preferences", requireAuth(["portal"]), async (req, res) => {
  const schema = z.object({
    lessonReminders: z.boolean(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = (req as any).user.sub;
  await User.updateOne(
    { _id: userId },
    { $set: { "preferences.lessonReminders": parsed.data.lessonReminders } }
  );
  res.json({ ok: true });
});

r.get("/settings", requireAuth(["admin"]), async (_req, res) => {
  const settings = await NotificationSettings.findById("notifications").lean();
  res.json(
    settings || {
      enabled: true,
      leadMinutes: 24 * 60,
      quietHours: { start: 22, end: 7 },
    }
  );
});

r.put("/settings", requireAuth(["admin"]), async (req, res) => {
  const schema = z.object({
    enabled: z.boolean(),
    leadMinutes: z.number().min(60).max(7 * 24 * 60),
    quietHours: z.object({
      start: z.number().min(0).max(23),
      end: z.number().min(0).max(23),
    }),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const settings = await NotificationSettings.findByIdAndUpdate(
    "notifications",
    { $set: parsed.data },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  res.json(settings);
});

export default r;
