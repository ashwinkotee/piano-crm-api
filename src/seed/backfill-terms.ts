import "dotenv/config";
import mongoose from "mongoose";
import Student from "../models/Student";

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set in environment.");
    process.exit(1);
  }
  await mongoose.connect(uri);

  // Group students by portal account (userId) and find accounts with any accepted terms
  const groups: Array<{ _id: any; count: number; acceptedCount: number; earliest?: Date }>= await (Student as any).aggregate([
    {
      $group: {
        _id: "$userId",
        count: { $sum: 1 },
        acceptedCount: { $sum: { $cond: [ "$termsAccepted", 1, 0 ] } },
        earliest: { $min: "$termsAcceptedAt" },
      },
    },
  ]);

  let accountsWithAcceptance = 0;
  let studentsUpdated = 0;

  for (const g of groups) {
    if (g.acceptedCount > 0) {
      accountsWithAcceptance++;
      const when = g.earliest || new Date();
      const res = await Student.updateMany(
        { userId: g._id, termsAccepted: { $ne: true } },
        { $set: { termsAccepted: true, termsAcceptedAt: when } }
      );
      studentsUpdated += (res as any).modifiedCount || 0;
    }
  }

  console.log("Accounts with acceptance:", accountsWithAcceptance);
  console.log("Students updated:", studentsUpdated);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Backfill failed", e);
  process.exit(1);
});

