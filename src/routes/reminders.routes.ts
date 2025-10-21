import { Router } from "express";
import { requireCronAuth } from "../middleware/cronAuth";
import { sendDueLessonReminders } from "../services/reminders";

const r = Router();

r.post("/send", requireCronAuth, async (_req, res) => {
  try {
    const summary = await sendDueLessonReminders();
    res.json(summary);
  } catch (err) {
    console.error("Reminder job failed", err);
    res.status(500).json({ error: "Reminder job failed" });
  }
});

export default r;
