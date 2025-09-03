import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User";
import Account from "../models/Account";
import Student from "../models/Student";

async function seedStudents() {
  const existing = await Student.countDocuments();
  if (existing > 0) return;

  // Example data (disabled by default)
  // await Student.insertMany([
  //   { name: "Alice Zhou", program: "One-on-one", ageGroup: "15+", monthlyFee: 200, active: true },
  //   { name: "Bob Singh", program: "Group", ageGroup: "6-9", monthlyFee: 139, active: true },
  // ]);
  console.log("Seeded students");
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  // --- Admin account ---
  const adminEmail = "admin@piano.local";
  const adminExists = await User.findOne({ email: adminEmail });
  if (adminExists) {
    console.log("Admin exists:", adminEmail);
  } else {
    const passwordHash = await bcrypt.hash("admin123", 10);
    const user = await User.create({
      email: adminEmail,
      passwordHash,
      role: "admin",
      profile: { name: "Studio Admin" },
    });
    await Account.create({
      userId: user._id,
      provider: "email",
      providerId: adminEmail,
    });
    console.log("Admin created:", adminEmail, "password: admin123");
  }

  await seedStudents();

  // --- Student / portal account ---
  const studentEmail = "student@piano.local";
  const studentExists = await User.findOne({ email: studentEmail });
  if (studentExists) {
    console.log("Student exists:", studentEmail);
  } else {
    const passwordHash = await bcrypt.hash("student123", 10);
    const user = await User.create({
      email: studentEmail,
      passwordHash,
      role: "portal",
      profile: { name: "Test Student" },
    });
    await Account.create({
      userId: user._id,
      provider: "email",
      providerId: studentEmail,
    });
    console.log("Student created:", studentEmail, "password: student123");
  }

  process.exit(0);
}

main();

