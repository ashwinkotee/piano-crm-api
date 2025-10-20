import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";
import { createApp } from "./app";

const baseEnvPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: baseEnvPath });

if (process.env.NODE_ENV === "development") {
  const devEnvPath = path.resolve(__dirname, "../.env.development");
  dotenv.config({ path: devEnvPath, override: true });
}

const app = createApp();

const MONGO: string = String(process.env.MONGO_URI || "");
mongoose
  .connect(MONGO)
  .then(async () => {
    const db = mongoose.connection.db?.databaseName;
    console.log("?o. Connected to MongoDB:", process.env.MONGO_URI);
    console.log("Mongo connected to DB:", db);
    const port = Number(process.env.PORT || 4000);
    app.listen(port, () => console.log(`API on :${port}`));
  })
  .catch((e) => {
    console.error("Mongo connect error", e);
    process.exit(1);
  });
