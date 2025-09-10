import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth } from "../middleware/auth";
import User from "../models/User";
import RefreshToken from "../models/RefreshToken";
import { signAccess, signRefresh, verifyToken } from "../utils/jwt";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

function isSecureCookie() {
  if (process.env.NODE_ENV === "production") return true;
  // Dev: secure only if CLIENT_URL is https
  try { return (process.env.CLIENT_URL || "").startsWith("https:"); } catch { return false; }
}

function cookieSameSite(): "strict" | "lax" | "none" {
  // Allow override via env; default to 'none' in production for cross-site setups
  const fromEnv = (process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'none' : 'strict')).toLowerCase();
  return (fromEnv === 'none' || fromEnv === 'lax' || fromEnv === 'strict') ? (fromEnv as any) : 'strict';
}

function cookieSecure(): boolean {
  const env = process.env.COOKIE_SECURE?.toLowerCase();
  if (env === 'true') return true;
  if (env === 'false') return false;
  return isSecureCookie();
}

function setRefreshCookie(res: any, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: "/auth",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30d
  });
}

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post("/login", authLimiter, async (req, res) => {
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

    const payload = { sub: String(user._id), role: user.role };
    const accessToken = signAccess(payload);

    // Refresh token rotation: use signed refresh with random jti persisted
    const jti = crypto.randomUUID();
    const refreshToken = signRefresh({ ...payload, jti });
    await RefreshToken.create({ userId: user._id, token: refreshToken });
    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      token: accessToken, // backward compatibility for current web client
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

// Issue a new access token using httpOnly refresh cookie; rotate refresh
router.post("/refresh", authLimiter, async (req: any, res) => {
  try {
    const cookie = req.cookies?.refreshToken;
    if (!cookie) { res.status(401).json({ error: "No refresh" }); return; }

    // Ensure token exists in DB and not revoked
    const doc = await RefreshToken.findOne({ token: cookie }).lean();
    if (!doc) { res.status(401).json({ error: "Invalid refresh" }); return; }

    const decoded: any = verifyToken(cookie);
    const user = await User.findById(decoded.sub).lean();
    if (!user) { res.status(401).json({ error: "Invalid user" }); return; }

    // Rotate refresh token
    await RefreshToken.deleteOne({ token: cookie }).catch(() => {});
    const payload = { sub: String(user._id), role: user.role } as const;
    const jti = crypto.randomUUID();
    const newRefresh = signRefresh({ ...payload, jti });
    await RefreshToken.create({ userId: user._id, token: newRefresh });
    setRefreshCookie(res, newRefresh);

    const accessToken = signAccess(payload);
    res.json({ accessToken });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// Logout: revoke refresh and clear cookie
router.post("/logout", async (req: any, res) => {
  try {
    const cookie = req.cookies?.refreshToken;
    if (cookie) await RefreshToken.deleteOne({ token: cookie }).catch(() => {});
    res.clearCookie("refreshToken", { path: "/auth" });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

export default router;
