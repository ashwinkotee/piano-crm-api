import { Request, Response, NextFunction } from "express";

export function requireCronAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.REMINDER_CRON_TOKEN;
  if (!expected) {
    console.error("REMINDER_CRON_TOKEN is not configured");
    res.status(500).json({ error: "Cron auth not configured" });
    return;
  }
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
