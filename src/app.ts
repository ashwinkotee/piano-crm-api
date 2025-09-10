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

// Build CORS allowlist from env (CLIENT_URL or ALLOWED_ORIGINS)
function buildCors() {
  const envList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const client = process.env.CLIENT_URL?.trim();
  const allowlist = new Set<string>([...envList, ...(client ? [client] : [])]);
  return cors({
    origin: function (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) {
      // Allow same-origin/LAN tools (no origin) and explicit allowlist
      if (!origin || allowlist.has(origin)) return cb(null, true);
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
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "base-uri": ["'self'"],
          "frame-ancestors": ["'none'"],
          "img-src": ["'self'", "data:"]
        },
      },
      referrerPolicy: { policy: "no-referrer" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
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
