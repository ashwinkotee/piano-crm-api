import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { requireAuth } from "../middleware/auth";
import Group from "../models/Group";
import Lesson from "../models/Lesson";

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
  res.json(doc);
});

r.put("/:id", requireAuth(["admin"]), async (req, res) => {
  const { name, description, memberIds } = UpsertSchema.parse(req.body);
  const doc = await Group.findByIdAndUpdate(
    req.params.id,
    { $set: { name, description, memberIds: memberIds.map((id) => new Types.ObjectId(id)) } },
    { new: true }
  );
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(doc);
});

// Add members
r.post("/:id/add-members", requireAuth(["admin"]), async (req, res) => {
  const schema = z.object({ memberIds: z.array(z.string()).min(1) });
  const { memberIds } = schema.parse(req.body);
  const doc = await Group.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { memberIds: { $each: memberIds.map((id) => new Types.ObjectId(id)) } } },
    { new: true }
  );
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(doc);
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

export default r;

