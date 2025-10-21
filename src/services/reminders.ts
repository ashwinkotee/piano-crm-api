import webpush from "web-push";
import { DateTime } from "luxon";
import Lesson from "../models/Lesson";
import PushSubscription from "../models/PushSubscription";
import NotificationLog from "../models/NotificationLog";
import NotificationSettings from "../models/NotificationSettings";
import Student from "../models/Student";
import User from "../models/User";
import { Types } from "mongoose";

const DEFAULT_SETTINGS = {
  enabled: true,
  leadMinutes: 24 * 60,
  quietHours: { start: 22, end: 7 },
};

type ReminderSummary = {
  lessonsConsidered: number;
  notificationsAttempted: number;
  notificationsSent: number;
  subscriptionsPruned: number;
  skipped: number;
};

let webPushConfigured = false;

function configureWebPush() {
  if (webPushConfigured) return;
  const publicKey = process.env.PUSH_VAPID_PUBLIC;
  const privateKey = process.env.PUSH_VAPID_PRIVATE;
  const subject = process.env.PUSH_VAPID_SUBJECT || "mailto:admin@ashwinmusic.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  webPushConfigured = true;
}

function isInQuietHours(hour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false; // disabled
  if (quietStart < quietEnd) {
    return hour >= quietStart && hour < quietEnd;
  }
  // spans midnight (e.g., 22 -> 7)
  return hour >= quietStart || hour < quietEnd;
}

function adjustForQuietHours(target: DateTime, quietStart: number, quietEnd: number): DateTime {
  if (!isInQuietHours(target.hour, quietStart, quietEnd)) return target;

  if (quietStart < quietEnd) {
    // same-day window
    if (target.hour < quietEnd) {
      return target.set({ hour: quietEnd, minute: 0, second: 0, millisecond: 0 });
    }
    return target.plus({ days: 1 }).set({ hour: quietEnd, minute: 0, second: 0, millisecond: 0 });
  }

  // spans midnight
  if (target.hour >= quietStart) {
    return target.plus({ days: 1 }).set({ hour: quietEnd, minute: 0, second: 0, millisecond: 0 });
  }
  return target.set({ hour: quietEnd, minute: 0, second: 0, millisecond: 0 });
}

async function loadSettings() {
  const existing = await NotificationSettings.findById("notifications").lean();
  if (!existing) {
    return DEFAULT_SETTINGS;
  }
  return {
    enabled: existing.enabled ?? DEFAULT_SETTINGS.enabled,
    leadMinutes: existing.leadMinutes ?? DEFAULT_SETTINGS.leadMinutes,
    quietHours: {
      start: existing.quietHours?.start ?? DEFAULT_SETTINGS.quietHours.start,
      end: existing.quietHours?.end ?? DEFAULT_SETTINGS.quietHours.end,
    },
  };
}

export async function sendDueLessonReminders(now = new Date()): Promise<ReminderSummary> {
  configureWebPush();

  const settings = await loadSettings();
  if (!settings.enabled) {
    return { lessonsConsidered: 0, notificationsAttempted: 0, notificationsSent: 0, subscriptionsPruned: 0, skipped: 0 };
  }

  const windowMinutes = Number(process.env.REMINDER_WINDOW_MINUTES || 30);

  const nowUtc = DateTime.fromJSDate(now).toUTC();
  const horizon = nowUtc.plus({ hours: 30 }); // look ahead to cover edge delays

  const lessons = await Lesson.find({
    status: "Scheduled",
    start: { $gte: nowUtc.minus({ hours: 1 }).toJSDate(), $lte: horizon.toJSDate() },
  }).lean();

  if (lessons.length === 0) {
    return { lessonsConsidered: 0, notificationsAttempted: 0, notificationsSent: 0, subscriptionsPruned: 0, skipped: 0 };
  }

  const studentIds = Array.from(
    new Set(lessons.map((l) => (l.studentId ? String(l.studentId) : "")).filter(Boolean))
  ).map((id) => new Types.ObjectId(id));

  const students = await Student.find({ _id: { $in: studentIds } }, { userId: 1, timezone: 1, name: 1 }).lean();
  const studentMap = new Map<string, typeof students[number]>();
  for (const s of students) {
    studentMap.set(String(s._id), s);
  }

  const userIds = Array.from(new Set(students.map((s) => String(s.userId)))).map((id) => new Types.ObjectId(id));
  const users = await User.find({ _id: { $in: userIds } }, { active: 1, preferences: 1 }).lean();
  const userMap = new Map<string, typeof users[number]>();
  for (const u of users) {
    userMap.set(String(u._id), u);
  }

  const subscriptions = await PushSubscription.find({ userId: { $in: userIds } }).lean();
  const subsByUser = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    const key = String(sub.userId);
    if (!subsByUser.has(key)) subsByUser.set(key, []);
    subsByUser.get(key)!.push(sub);
  }

  const summary: ReminderSummary = {
    lessonsConsidered: lessons.length,
    notificationsAttempted: 0,
    notificationsSent: 0,
    subscriptionsPruned: 0,
    skipped: 0,
  };

  const defaultTz = process.env.DEFAULT_TIMEZONE || "America/Halifax";

  for (const lesson of lessons) {
    if (!lesson.studentId) {
      summary.skipped++;
      continue;
    }

    const student = studentMap.get(String(lesson.studentId));
    if (!student) {
      summary.skipped++;
      continue;
    }

    const user = userMap.get(String(student.userId));
    if (!user || user.active === false) {
      summary.skipped++;
      continue;
    }

    if (user.preferences && user.preferences.lessonReminders === false) {
      summary.skipped++;
      continue;
    }

    const userSubs = subsByUser.get(String(user._id));
    if (!userSubs || userSubs.length === 0) {
      summary.skipped++;
      continue;
    }

    const tz = student.timezone || defaultTz;
    const lessonStartLocal = DateTime.fromJSDate(lesson.start).setZone(tz);
    const targetSendLocal = lessonStartLocal.minus({ minutes: settings.leadMinutes });
    const effectiveSendLocal = adjustForQuietHours(targetSendLocal, settings.quietHours.start, settings.quietHours.end);
    const nowLocal = nowUtc.setZone(tz);

    const windowStart = effectiveSendLocal;
    const windowEnd = effectiveSendLocal.plus({ minutes: windowMinutes });

    if (nowLocal < windowStart || nowLocal >= windowEnd) {
      summary.skipped++;
      continue;
    }

    for (const sub of userSubs) {
      summary.notificationsAttempted++;
      try {
        await NotificationLog.create({
          subscriptionId: sub._id,
          lessonId: lesson._id,
          kind: "lesson-reminder",
          sentAt: new Date(),
        });
      } catch (err: any) {
        if (err?.code === 11000) {
          continue; // already sent
        }
        throw err;
      }

      const startTimeLocal = lessonStartLocal.toFormat("cccc, MMM d 'at' h:mm a");
      const payload = {
        title: "🎹 Piano Lesson Reminder",
        body: `Your Piano lesson is tomorrow at ${startTimeLocal}.`,
        data: {
          url: `https://portal.ashwinmusic.com/lessons/${lesson._id.toString()}`,
          lessonId: lesson._id.toString(),
        },
        icon: "/icons/push-128.png",
        badge: "/icons/badge-72.png",
      };

      try {
        await webpush.sendNotification(sub.subscription as any, JSON.stringify(payload), {
          TTL: 24 * 60 * 60,
        });
        await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastSeenAt: new Date() } });
        summary.notificationsSent++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          summary.subscriptionsPruned++;
        } else {
          console.error("Failed to send push notification", err);
        }
      }
    }
  }

  return summary;
}
