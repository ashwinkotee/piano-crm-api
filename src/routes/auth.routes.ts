import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth";
import User from "../models/User";

const router = Router();
const JWT_EXPIRES_IN = "30d";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const secret = process.env.JWT_SECRET || "dev_secret_change_me";
    const token = jwt.sign({ sub: String(user._id), role: user.role }, secret, { expiresIn: JWT_EXPIRES_IN });
    res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        mustChangePassword: !!user.mustChangePassword,
      },
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Return the current authenticated user's profile
router.get("/me", requireAuth(["admin", "portal"]), async (req: any, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      _id: user._id,
      email: user.email,
      role: user.role,
      mustChangePassword: !!user.mustChangePassword,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

/** Change password (admin/portal) */
const ChangePwSchema = z.object({
  // When user.mustChangePassword is true, currentPassword can be omitted
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8),
});

router.post("/change-password", requireAuth(["admin", "portal"]), async (req: any, res) => {
  try {
    const { currentPassword, newPassword } = ChangePwSchema.parse(req.body);

    const userId = req.user?.sub || req.user?._id;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // If the user is flagged to change temp password, skip current password check
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        res.status(400).json({ error: "Current password is required" });
        return;
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        res.status(400).json({ error: "Current password is incorrect" });
        return;
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

export default router;
