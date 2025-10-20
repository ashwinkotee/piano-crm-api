import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { requireAuth } from "../middleware/auth";
import Group from "../models/Group";
import Lesson from "../models/Lesson";
import { fetchGroupLessonsForGroup } from "../services/groupLessons";

const r = Router();

// List groups
r.get("/", requireAuth(["admin"]), async (_req, res) => {
  const items = await Group.find({ active: true }).sort({ name: 1 }).lean();
  res.json(items);
});

// Create or update a group with members
const UpsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  memberIds: z.array(z.string()).default([]),
});

r.post("/", requireAuth(["admin"]), async (req, res) => {
  const { name, description, memberIds } = UpsertSchema.parse(req.body);
  const doc = await Group.create({
    name,
    description,
    memberIds: memberIds.map((id) => new Types.ObjectId(id)),
  });
  res.json({ group: doc, meta: { createdLessons: 0, removedLessons: 0, addedMembers: memberIds.length, removedMembers: 0 } });
});

r.put("/:id", requireAuth(["admin"]), async (req, res) => {
  const { name, description, memberIds } = UpsertSchema.parse(req.body);

  // Get current members to compute diffs
  const before = await Group.findById(req.params.id).lean();
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const doc = await Group.findByIdAndUpdate(
    req.params.id,
    { $set: { name, description, memberIds: memberIds.map((id) => new Types.ObjectId(id)) } },
    { new: true }
  );
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Compute added and removed members
  const prevSet = new Set((before.memberIds || []).map((x: any) => String(x)));
  const nextSet = new Set((doc.memberIds || []).map((x: any) => String(x)));
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of nextSet) if (!prevSet.has(id)) added.push(id);
  for (const id of prevSet) if (!nextSet.has(id)) removed.push(id);

  const now = new Date();
  const docMemberIds = (doc.memberIds || []).map((id: any) => new Types.ObjectId(id));
  const groupContext = { _id: doc._id as any, memberIds: docMemberIds };

  // If members were added: clone upcoming group lessons for the group
  let createdCount = 0;
  if (added.length > 0) {
    try {
      const upcoming = await fetchGroupLessonsForGroup({
        group: groupContext,
        match: { status: "Scheduled", start: { $gte: now } },
      });

      if (upcoming.length > 0) {
        const uniq = new Map<string, { start: Date; end: Date; notes?: string }>();
        for (const l of upcoming) {
          const startDate = new Date(l.start);
          const endDate = new Date(l.end);
          const key = `${startDate.getTime()}_${endDate.getTime()}_${l.notes || ""}`;
          if (!uniq.has(key)) uniq.set(key, { start: startDate, end: endDate, notes: l.notes });
        }
        for (const sid of added) {
          const studentObjId = new Types.ObjectId(sid);
          for (const { start, end, notes } of uniq.values()) {
            const exists = await Lesson.findOne({
              studentId: studentObjId,
              type: "group",
              start,
              end,
              status: "Scheduled",
              $or: [{ groupId: doc._id as any }, { groupId: { $exists: false } }],
            }).lean();
            if (exists) continue;
            await Lesson.create({
              studentId: studentObjId,
              groupId: doc._id as any,
              type: "group",
              start,
              end,
              status: "Scheduled",
              notes,
            });
            createdCount++;
          }
        }
      }
    } catch (e) {
      console.error("Failed to clone lessons for added members:", e);
    }
  }

  // If members were removed: delete their upcoming scheduled group lessons
  let removedCount = 0;
  if (removed.length > 0) {
    try {
      const removedObjIds = removed.map((id) => new Types.ObjectId(id));
      const upcomingToRemove = await fetchGroupLessonsForGroup({
        group: groupContext,
        limitToMembers: removedObjIds,
        match: { status: "Scheduled", start: { $gte: now } },
      });
      if (upcomingToRemove.length > 0) {
        const idsToDelete = Array.from(
          new Map(upcomingToRemove.map((l) => [String(l._id), l._id as any])).values()
        );
        const result: any = await Lesson.deleteMany({ _id: { $in: idsToDelete } });
        removedCount = result?.deletedCount || 0;
      }
    } catch (e) {
      console.error("Failed to remove lessons for removed members:", e);
    }
  }

  res.json({
    group: doc,
    meta: {
      createdLessons: createdCount,
      removedLessons: removedCount,
      addedMembers: added.length,
      removedMembers: removed.length,
    },
  });
});

// Add members
r.post("/:id/add-members", requireAuth(["admin"]), async (req, res) => {
  const schema = z.object({ memberIds: z.array(z.string()).min(1) });
  const { memberIds } = schema.parse(req.body);

  // Capture members before update to determine which are new
  const before = await Group.findById(req.params.id, { memberIds: 1 }).lean();
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const doc = await Group.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { memberIds: { $each: memberIds.map((id) => new Types.ObjectId(id)) } } },
    { new: true }
  );
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  let createdCount = 0;
  let newlyAdded: string[] = [];
  try {
    // Determine newly added member ids (as strings)
    const beforeSet = new Set((before.memberIds || []).map((x: any) => String(x)));
    newlyAdded = memberIds.filter((id) => !beforeSet.has(String(id)));

    if (newlyAdded.length > 0) {
      // Find upcoming scheduled group lessons (for any member) for this group
      const now = new Date();
      const groupMemberIds = (doc.memberIds || []).map((id: any) => new Types.ObjectId(id));
      const existing = await fetchGroupLessonsForGroup({
        group: { _id: doc._id as any, memberIds: groupMemberIds },
        match: { status: "Scheduled", start: { $gte: now } },
      });

      if (existing.length > 0) {
        // Deduplicate by start/end/notes to get the schedule instances
        const uniq = new Map<string, { start: Date; end: Date; notes?: string }>();
        for (const l of existing) {
          const startDate = new Date(l.start);
          const endDate = new Date(l.end);
          const key = `${startDate.getTime()}_${endDate.getTime()}_${l.notes || ""}`;
          if (!uniq.has(key)) uniq.set(key, { start: startDate, end: endDate, notes: l.notes });
        }

        for (const sid of newlyAdded) {
          const studentObjId = new Types.ObjectId(sid);
          for (const { start, end, notes } of uniq.values()) {
            const exists = await Lesson.findOne({
              studentId: studentObjId,
              type: "group",
              start,
              end,
              status: "Scheduled",
              $or: [{ groupId: doc._id as any }, { groupId: { $exists: false } }],
            }).lean();
            if (exists) continue;
            await Lesson.create({
              studentId: studentObjId,
              groupId: doc._id as any,
              type: "group",
              start,
              end,
              status: "Scheduled",
              notes,
            });
            createdCount++;
          }
        }
      }
    }
  } catch (e: any) {
    console.error("Error creating lessons for new group members:", e);
    // non-fatal: membership change succeeded even if lesson cloning had issues
  }

  res.json({ group: doc, meta: { createdLessons: createdCount, removedLessons: 0, addedMembers: newlyAdded.length, removedMembers: 0 } });
});

// Schedule group sessions for given dates (e.g., 2 per month)
r.post("/:id/schedule", requireAuth(["admin"]), async (req, res) => {
  const schema = z.object({
    dates: z.array(z.string()).min(1), // ISO start datetimes
    durationMinutes: z.number().min(15).max(240).default(60),
    notes: z.string().optional(),
  });
  const { dates, durationMinutes, notes } = schema.parse(req.body);

  const group = await Group.findById(req.params.id).lean();
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  if (!group.memberIds || group.memberIds.length === 0) {
    res.status(400).json({ error: "Group has no members" });
    return;
  }

  let created = 0;
  for (const iso of dates) {
    const start = new Date(iso);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    for (const studentId of group.memberIds as any[]) {
      await Lesson.create({
        studentId,
        groupId: group._id as any,
        type: "group",
        start,
        end,
        status: "Scheduled",
        notes,
      })
        .then(() => created++)
        .catch((e) => {
          if (e?.code !== 11000) throw e;
        });
    }
  }

  res.json({ ok: true, created });
});

// Soft delete a group
r.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  const doc = await Group.findByIdAndUpdate(
    req.params.id,
    { $set: { active: false } },
    { new: true }
  );
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

export default r;
