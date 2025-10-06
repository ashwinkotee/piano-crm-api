import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import Lesson from "../models/Lesson";
import Student from "../models/Student";
import { requireAuth } from "../middleware/auth";

const r = Router();

/** GET /lessons?view=month|week&start=YYYY-MM-DD[&studentId=...] */
r.get("/", requireAuth(["admin", "portal"]), async (req: any, res) => {
  try {
    const view = (req.query.view as "week" | "month") || "month";
    const startStr = String(req.query.start || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
      res.status(400).json({ error: "start must be YYYY-MM-DD" });
      return;
    }
    const [y, m, d] = startStr.split("-").map(Number);
    const from = new Date(y, m - 1, d);
    const to = view === "week" ? new Date(y, m - 1, d + 7) : new Date(y, m, 1);

    const q: any = { start: { $gte: from, $lt: to } };
    const requestedStudentId = String(req.query.studentId || "").trim();

    // Portal users see only their own students' lessons
    if (req.user.role !== "admin") {
      const raw = req.user.sub ?? req.user._id ?? req.user.id;
      const idStr = String(raw);
      const portalIds: any[] = [idStr];
      if (Types.ObjectId.isValid(idStr)) portalIds.push(new Types.ObjectId(idStr));

      const myStudents = await Student.find({ userId: { $in: portalIds } }, { _id: 1 }).lean();
      if (!myStudents.length) { res.json([]); return; }

      if (requestedStudentId) {
        if (!Types.ObjectId.isValid(requestedStudentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
        const isMine = myStudents.some(s => String(s._id) === requestedStudentId);
        if (!isMine) { res.status(403).json({ error: "Forbidden" }); return; }
        q.studentId = new Types.ObjectId(requestedStudentId);
      } else {
        q.studentId = { $in: myStudents.map((s) => s._id) };
      }
    } else if (requestedStudentId) {
      // Admin can optionally filter by studentId
      if (!Types.ObjectId.isValid(requestedStudentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
      q.studentId = new Types.ObjectId(requestedStudentId);
    }

    const items = await Lesson.find(q).sort({ start: 1 }).lean();
    res.json(items);
  } catch (e: any) {
    console.error("GET /lessons failed:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

/** POST /lessons  (admin) */
r.post("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const common = { start: z.string(), end: z.string(), notes: z.string().optional() } as const;
    const schema = z.union([
      z.object({ type: z.literal("demo"), demoName: z.string().min(1), ...common }),
      z.object({ type: z.enum(["one","group"]), studentId: z.string(), ...common }),
    ]);
    const parsed = schema.parse(req.body as any);

    const base: any = {
      type: parsed.type,
      start: new Date((parsed as any).start),
      end: new Date((parsed as any).end),
      status: "Scheduled",
      notes: (parsed as any).notes,
    };
    if (parsed.type === "demo") {
      base.demoName = (parsed as any).demoName;
    } else {
      base.studentId = new Types.ObjectId((parsed as any).studentId);
    }

    const doc = await Lesson.create(base);
    res.json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

/** PUT /lessons/:id  (admin) */
r.put("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const before = await Lesson.findById(req.params.id);
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const update: any = {};
    if (req.body.start) update.start = new Date(req.body.start);
    if (req.body.end) update.end = new Date(req.body.end);
    if (req.body.status) update.status = req.body.status;
    if (req.body.notes !== undefined) update.notes = req.body.notes;

    const doc = await Lesson.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const touchesSharedFields = Boolean(
      req.body.start || req.body.end || req.body.status || req.body.notes !== undefined
    );

    if (before.type === "group" && before.groupId && touchesSharedFields) {
      const sharedUpdate: any = {};
      if (req.body.start) sharedUpdate.start = new Date(req.body.start);
      if (req.body.end) sharedUpdate.end = new Date(req.body.end);
      if (req.body.status) sharedUpdate.status = req.body.status;
      if (req.body.notes !== undefined) sharedUpdate.notes = req.body.notes;

      if (Object.keys(sharedUpdate).length > 0) {
        const startValues = [before.start];
        if (req.body.start) startValues.push(new Date(req.body.start));

        const uniqueStarts = Array.from(
          new Set(startValues.map((d) => d?.getTime()).filter((ms): ms is number => typeof ms === "number"))
        ).map((ms) => new Date(ms));

        const siblingMatch: any = {
          _id: { $ne: doc._id },
          groupId: before.groupId,
          type: "group",
        };

        if (uniqueStarts.length === 1) {
          siblingMatch.start = uniqueStarts[0];
        } else if (uniqueStarts.length > 1) {
          siblingMatch.start = { $in: uniqueStarts };
        }

        await Lesson.updateMany(siblingMatch, { $set: sharedUpdate });
      }
    }

    res.json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});
/** DELETE /lessons/:id  (admin) */
r.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
  const doc = await Lesson.findByIdAndDelete(req.params.id);
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

/** POST /lessons/generate-month (admin) */
r.post("/generate-month", requireAuth(["admin"]), async (req, res) => {
  try {
    const schema = z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
      durationMinutes: z.number().min(15).max(180),
      includeFifth: z.boolean().optional().default(false),
    });
    const { year, month, durationMinutes, includeFifth } = schema.parse(req.body);

    const students = await Student.find({
      active: true,
      "defaultSlot.weekday": { $exists: true },
      "defaultSlot.time": { $exists: true },
    }).lean();

    let created = 0;

    for (const s of students) {
      const slot: any = (s as any).defaultSlot;
      if (!slot) continue;
      const [h, m] = String(slot.time).split(":").map(Number);

      const firstOfMonth = new Date(year, month - 1, 1);
      const firstWeekday = new Date(firstOfMonth);
      const delta = (slot.weekday - firstOfMonth.getDay() + 7) % 7;
      firstWeekday.setDate(firstOfMonth.getDate() + delta);

      const count = includeFifth ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const day = new Date(firstWeekday);
        day.setDate(firstWeekday.getDate() + i * 7);
        if (day.getMonth() !== firstOfMonth.getMonth()) break;

        const start = new Date(day);
        start.setHours(h, m, 0, 0);
        const end = new Date(start.getTime() + durationMinutes * 60000);

        await Lesson.create({
          studentId: s._id as any,
          type: (s as any).program === "Group" ? "group" : "one",
          start,
          end,
          status: "Scheduled",
        })
          .then(() => created++)
          .catch((e) => {
            if (e?.code !== 11000) throw e;
          });
      }
    }

    res.json({ ok: true, created });
  } catch (e: any) {
    console.error("Generate month failed:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

export default r;




