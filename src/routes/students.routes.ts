import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import Student from "../models/Student";
import User from "../models/User";
import { requireAuth } from "../middleware/auth";
import Lesson from "../models/Lesson";
import Homework from "../models/Homework";
import RefreshToken from "../models/RefreshToken";

const r = Router();

const CreateStudentSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1).optional(),
  dateOfBirth: z.string().datetime().optional(),
  parentName: z.string().min(1).optional(),
  parentPhone: z.string().min(1).optional(),
  email: z.string().email(),
  program: z.enum(["One-on-one", "Group"]),
  ageGroup: z.enum(["6-9","10-14","15+"]).optional(),
  monthlyFee: z.number().optional(),
  defaultSlot: z.object({
    weekday: z.number().min(0).max(6),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
});

const UpdateStudentSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  dateOfBirth: z.string().datetime().optional(),
  parentName: z.string().min(1).optional(),
  parentPhone: z.string().min(1).optional(),
  program: z.enum(["One-on-one", "Group"]).optional(),
  ageGroup: z.enum(["6-9","10-14","15+"]).optional(),
  monthlyFee: z.number().optional(),
  active: z.boolean().optional(),
  defaultSlot: z.object({
    weekday: z.number().min(0).max(6),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
});

r.get("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter: any = {};
    if (q) filter.name = { $regex: q, $options: "i" };
    const items = await Student.find(filter).sort({ name: 1 }).lean();
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});

r.post("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const { name, address, dateOfBirth, parentName, parentPhone, email, program, ageGroup, monthlyFee, defaultSlot } = CreateStudentSchema.parse(req.body);

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: "A portal user with this email already exists" });
      return;
    }

    // Use local-part of email as temporary password (text before @)
    const localPart = email.split("@")[0] || "temp12345";
    const tempPassword = localPart;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const portalUser = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      role: "portal",
      active: true,
      mustChangePassword: true, // Force first login change
    });

    const student = await Student.create({
      name,
      address,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      parentName,
      parentPhone,
      program,
      ageGroup,
      monthlyFee: monthlyFee ?? 0,
      userId: new Types.ObjectId(String(portalUser._id)),
      defaultSlot,
    });

    res.json({
      _id: student._id,
      name: student.name,
      address: student.address,
      dateOfBirth: student.dateOfBirth,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      program: student.program,
      ageGroup: student.ageGroup,
      monthlyFee: student.monthlyFee,
      active: student.active,
      userId: student.userId,
      termsAccepted: student.termsAccepted,
      termsAcceptedAt: student.termsAcceptedAt,
      portalUser: { _id: portalUser._id, email: portalUser.email },
      tempPassword,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

/**
 * Create a sibling student under the same portal account as the base student
 * POST /students/:id/siblings (admin)
 */
r.post("/:id/siblings", requireAuth(["admin"]), async (req, res) => {
  try {
    const BaseSchema = z.object({
      name: z.string().min(1),
      address: z.string().min(1).optional(),
      dateOfBirth: z.string().datetime().optional(),
      parentName: z.string().min(1).optional(),
      parentPhone: z.string().min(1).optional(),
      program: z.enum(["One-on-one", "Group"]),
      ageGroup: z.enum(["6-9", "10-14", "15+"]).optional(),
      monthlyFee: z.number().optional(),
      defaultSlot: z.object({
        weekday: z.number().min(0).max(6),
        time: z.string().regex(/^\d{2}:\d{2}$/),
      }).optional(),
    });
    const payload = BaseSchema.parse(req.body);

    const base = await Student.findById(req.params.id);
    if (!base) {
      res.status(404).json({ error: "Base student not found" });
      return;
    }

    // If any student under this account has accepted terms, propagate that to the new sibling
    const accepted = base.termsAccepted ? base : await Student.findOne({ userId: base.userId, termsAccepted: true }).lean();

    const doc = await Student.create({
      name: payload.name,
      address: payload.address,
      dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
      parentName: payload.parentName ?? base.parentName,
      parentPhone: payload.parentPhone ?? base.parentPhone,
      program: payload.program,
      ageGroup: payload.ageGroup,
      monthlyFee: payload.monthlyFee ?? base.monthlyFee ?? 0,
      userId: base.userId, // link to same portal account
      defaultSlot: payload.defaultSlot,
      termsAccepted: !!accepted,
      termsAcceptedAt: accepted ? (accepted as any).termsAcceptedAt || new Date() : undefined,
    });

    res.json({
      _id: doc._id,
      name: doc.name,
      address: doc.address,
      dateOfBirth: doc.dateOfBirth,
      parentName: doc.parentName,
      parentPhone: doc.parentPhone,
      program: doc.program,
      ageGroup: doc.ageGroup,
      monthlyFee: doc.monthlyFee,
      active: doc.active,
      userId: doc.userId,
      termsAccepted: doc.termsAccepted,
      termsAcceptedAt: doc.termsAcceptedAt,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

r.put("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const update = UpdateStudentSchema.parse(req.body);
    const doc = await Student.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
  }
  res.json(doc);
} catch (e: any) {
  res.status(400).json({ error: e.message || "Bad request" });
}
});

// Admin: get student by ID
r.get("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const doc = await Student.findById(req.params.id).lean();
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Also include the linked portal user's email for display in the admin UI
    let portalUser: { _id?: string; email?: string } | undefined = undefined;
    try {
      const u = await User.findById(doc.userId).lean();
      if (u) portalUser = { _id: String(u._id), email: u.email };
    } catch {}

    res.json({ ...doc, portalUser });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Portal: get my linked students
r.get("/me/list", requireAuth(["portal"]), async (req: any, res) => {
  try {
    const userId = new Types.ObjectId(String(req.user.sub || req.user._id));
    const items = await Student.find({ userId }).sort({ name: 1 }).lean();
    res.json(items);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Portal: accept Terms & Conditions for all my linked students
r.post("/me/accept-terms", requireAuth(["portal"]), async (req: any, res) => {
  try {
    const userId = new Types.ObjectId(String(req.user.sub || req.user._id));
    const when = new Date();
    const result = await Student.updateMany({ userId }, { $set: { termsAccepted: true, termsAcceptedAt: when } });
    res.json({ updated: result.modifiedCount ?? 0, at: when });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Delete student (and portal user if no more students remain)
r.delete("/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) { res.status(404).json({ error: "Not found" }); return; }

    const userId = student.userId ? new Types.ObjectId(String(student.userId)) : null;

    // Cleanup linked data for this student
    await Promise.all([
      Lesson.deleteMany({ studentId: student._id }).catch(()=>{}),
      Homework.deleteMany({ studentId: student._id }).catch(()=>{}),
    ]);

    await student.deleteOne();

    if (userId) {
      const remaining = await Student.countDocuments({ userId });
      if (remaining === 0) {
        await Promise.all([
          RefreshToken.deleteMany({ userId }).catch(()=>{}),
          User.deleteOne({ _id: userId }).catch(()=>{}),
        ]);
      }
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

export default r;

