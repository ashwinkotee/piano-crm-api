import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes";
import studentsRoutes from "./routes/students.routes";
import lessonsRoutes from "./routes/lessons.routes";
import groupsRoutes from "./routes/groups.routes";
import homeworkRoutes from "./routes/homework.routes";
import notificationsRoutes from "./routes/notifications.routes";
import remindersRoutes from "./routes/reminders.routes";

// Build CORS allowlist from env (CLIENT_URL or ALLOWED_ORIGINS)
function buildCors() {
  const normalize = (value: string) => {
    try {
      const url = new URL(value);
      // Return e.g. http://localhost:5173 (no trailing slash)
      return `${url.protocol}//${url.host}`;
    } catch {
      return value.replace(/\/$/, "");
    }
  };

  const envList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalize);
  const client = process.env.CLIENT_URL?.trim();
  const allowlist = new Set<string>([...envList, ...(client ? [normalize(client)] : [])]);

  const isDev = (process.env.NODE_ENV || "development") !== "production";
  const shouldLogCors = process.env.CORS_DEBUG === 'true' || isDev;

  return cors({
    origin: function (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) {
      if (!origin) return cb(null, true); // same-origin or tools without Origin header
      const normalized = normalize(origin);
      if (allowlist.has(normalized)) return cb(null, true);

      // In dev, allow localhost and 127.0.0.1 on any port
      if (isDev) {
        try {
          const { hostname } = new URL(origin);
          if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return cb(null, true);
          }
        } catch {}
      }

      if (shouldLogCors) {
        try {
          console.warn("CORS: origin not allowed", {
            origin,
            normalized,
            allowlist: Array.from(allowlist),
          });
        } catch {}
      }
      return cb(new Error("CORS: origin not allowed"));
    },
    credentials: true,
  });
}

export function createApp() {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      referrerPolicy: { policy: "no-referrer" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: process.env.NODE_ENV === "production" ? undefined : false,
    })
  );

  app.use(buildCors());
  app.use(cookieParser());
  app.use(express.json());
  app.use(morgan("tiny"));

  // Health
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Routes
  app.use("/auth", authRoutes);
  app.use("/students", studentsRoutes);
  app.use("/lessons", lessonsRoutes);
  app.use("/groups", groupsRoutes);
  app.use("/notifications", notificationsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/reminders", remindersRoutes);
  app.use("/api/reminders", remindersRoutes);
  app.use("/", homeworkRoutes);

  // Error handler (last)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err?.status || 500;
    const msg = status === 500 ? "Server error" : err?.message || "Error";
    if (status === 500) console.error("Unhandled error:", err);
    res.status(status).json({ error: msg });
  });

  return app;
}
