import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import Homework from "../models/Homework";
import Student from "../models/Student";
import { requireAuth } from "../middleware/auth";

const r = Router();

// Admin: list homework for a student
r.get("/students/:id/homework", requireAuth(["admin"]), async (req, res) => {
  try {
    const studentId = new Types.ObjectId(String(req.params.id));
    const items = await Homework.find({ studentId }).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Admin: add homework for a student
r.post("/students/:id/homework", requireAuth(["admin"]), async (req, res) => {
  try {
    const schema = z.object({ text: z.string().min(1) });
    const { text } = schema.parse(req.body);
    const studentId = new Types.ObjectId(String(req.params.id));
    const item = await Homework.create({ studentId, text, status: "Assigned" });
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Update homework (admin can edit text/status; portal can only mark Completed on own student's homework)
r.put("/homework/:id", requireAuth(["admin", "portal"]), async (req: any, res) => {
  try {
    const schema = z.object({ text: z.string().min(1).optional(), status: z.enum(["Assigned", "Completed"]).optional() });
    const patch = schema.parse(req.body);
    const doc = await Homework.findById(req.params.id);
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    if (req.user.role === "portal") {
      // Verify ownership by user
      const student = await Student.findById(doc.studentId).lean();
      const myId = String(req.user.sub || req.user._id);
      if (!student || String(student.userId) !== myId) { res.status(403).json({ error: "Forbidden" }); return; }
      // Portal can only change status, and only to Completed
      if (!patch.status || patch.status !== "Completed") { res.status(400).json({ error: "Only status=Completed allowed" }); return; }
      doc.status = "Completed";
    } else {
      // admin
      if (patch.text !== undefined) doc.text = patch.text;
      if (patch.status !== undefined) doc.status = patch.status;
    }

    await doc.save();
    res.json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Admin: delete homework
r.delete("/homework/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const doc = await Homework.findByIdAndDelete(req.params.id);
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Portal: list my homework across my students
r.get("/homework/mine", requireAuth(["portal"]), async (req: any, res) => {
  try {
    const studentIds = await Student.find({ userId: new Types.ObjectId(String(req.user.sub || req.user._id)) }, { _id: 1 }).lean();
    const ids = studentIds.map(s => s._id);
    const items = await Homework.find({ studentId: { $in: ids } }).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

export default r;
