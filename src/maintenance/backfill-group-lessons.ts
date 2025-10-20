import path from "path";
import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import Group from "../models/Group";
import Lesson from "../models/Lesson";
import { fetchGroupLessonsForGroup } from "../services/groupLessons";

const baseEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: baseEnvPath });

if (process.env.NODE_ENV === "development") {
  const devEnvPath = path.resolve(__dirname, "../../.env.development");
  dotenv.config({ path: devEnvPath, override: true });
}

const STATUS_PRIORITY: Record<string, number> = {
  Scheduled: 0,
  Cancelled: 1,
  Completed: 2,
};

type LessonKey = string;

function makeKey(lesson: any): LessonKey {
  const start = new Date(lesson.start).getTime();
  const end = new Date(lesson.end).getTime();
  return `${start}_${end}`;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set in environment.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const groups = await Group.find({}, { name: 1, memberIds: 1, active: 1 }).lean();
  const now = new Date();
  let totalAssigned = 0;
  let totalStatusSynced = 0;
  let totalCreated = 0;

  for (const group of groups) {
    const memberIds = (group.memberIds as any[] | undefined)?.map((id) => new Types.ObjectId(id)) ?? [];
    if (memberIds.length === 0) continue;
    const memberIdSet = new Set(memberIds.map((id) => String(id)));

    const missingBefore = await Lesson.countDocuments({
      type: "group",
      groupId: { $exists: false },
      studentId: { $in: memberIds },
    });

    const lessons = await fetchGroupLessonsForGroup({
      group: { _id: group._id as any, memberIds },
    });

    const missingAfter = lessons.filter((l) => !l.groupId).length;
    totalAssigned += Math.max(0, missingBefore - missingAfter);

    const buckets = new Map<LessonKey, any[]>();
    for (const lesson of lessons) {
      const belongsToGroup =
        (lesson.groupId && String(lesson.groupId) === String(group._id)) ||
        (!lesson.groupId && lesson.studentId && memberIdSet.has(String(lesson.studentId)));
      if (belongsToGroup) {
        const key = makeKey(lesson);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(lesson);
      }
    }

    for (const [, bucket] of buckets) {
      if (bucket.length === 0) continue;
      let targetStatus = bucket[0].status;
      let bestPriority = STATUS_PRIORITY[targetStatus] ?? 0;
      for (const lesson of bucket) {
        const pri = STATUS_PRIORITY[lesson.status] ?? 0;
        if (pri > bestPriority) {
          bestPriority = pri;
          targetStatus = lesson.status;
        }
      }

      const toUpdate = bucket
        .filter((lesson) => lesson.status !== targetStatus)
        .map((lesson) => lesson._id);

      if (toUpdate.length > 0) {
        const result = await Lesson.updateMany({ _id: { $in: toUpdate } }, { $set: { status: targetStatus } });
        totalStatusSynced += (result as any).modifiedCount || 0;
      }

      if (group.active === false) continue;

      const startDate = new Date(bucket[0].start);
      if (startDate < now) continue;
      const endDate = new Date(bucket[0].end);
      const notes = bucket[0].notes;
      const have = new Set(bucket.map((lesson) => String(lesson.studentId)));

      for (const memberId of memberIds) {
        const memberKey = String(memberId);
        if (have.has(memberKey)) continue;

        const duplicate = await Lesson.findOne({
          studentId: memberId,
          type: "group",
          start: startDate,
          end: endDate,
          $or: [
            { groupId: group._id as any },
            { groupId: { $exists: false } },
          ],
        }).lean();
        if (duplicate) continue;

        await Lesson.create({
          studentId: memberId,
          groupId: group._id as any,
          type: "group",
          start: startDate,
          end: endDate,
          status: targetStatus || "Scheduled",
          notes,
        });
        totalCreated++;
      }
    }
  }

  console.log(`Assigned groupId to ${totalAssigned} lesson(s).`);
  console.log(`Aligned status across ${totalStatusSynced} lesson(s).`);
  console.log(`Created ${totalCreated} missing lesson(s) for current group members.`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Backfill failed", e);
  process.exit(1);
});




