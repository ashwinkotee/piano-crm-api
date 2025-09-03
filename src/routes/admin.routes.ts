// api/src/routes/admin.routes.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Example admin-only endpoint
router.get("/data", requireAuth(["admin"]), (req, res) => {
  res.json({ secret: "admin only data" });
});

export default router;
