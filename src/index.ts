import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import studentsRoutes from "./routes/students.routes";
import lessonsRoutes from "./routes/lessons.routes";
import groupsRoutes from "./routes/groups.routes";
import homeworkRoutes from "./routes/homework.routes";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/students", studentsRoutes);
app.use("/lessons", lessonsRoutes);
app.use("/groups", groupsRoutes);
app.use("/", homeworkRoutes);

// Requests feature deferred
// import requestsRoutes from "./routes/requests.routes";
// app.use("/requests", requestsRoutes);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGO: string = String(process.env.MONGO_URI || "");
mongoose
  .connect(MONGO)
  .then(async () => {
    const db = mongoose.connection.db?.databaseName;
    console.log("Mongo connected to DB:", db);
    const port = Number(process.env.PORT || 4000);
    app.listen(port, () => console.log(`API on :${port}`));
    
  })
  .catch((e) => {
    console.error("Mongo connect error", e);
    process.exit(1);
  });
