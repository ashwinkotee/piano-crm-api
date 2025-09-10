import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";
import { createApp } from "./app";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = createApp();

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
