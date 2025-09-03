import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import Student from "../models/Student";
import User from "../models/User";
import { requireAuth } from "../middleware/auth";

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
      portalUser: { _id: portalUser._id, email: portalUser.email },
      tempPassword,
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
    res.json(doc);
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

export default r;

