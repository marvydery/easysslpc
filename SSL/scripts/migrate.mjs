// Quick migration script: add is_admin column to users table
import postgres from "postgres";
import { readFileSync } from "fs";

// Load .env manually
const env = readFileSync(".env", "utf-8");
for (const line of env.split("\n")) {
  const [key, ...vals] = line.split("=");
  if (key && !key.startsWith("#")) {
    process.env[key.trim()] = vals.join("=").trim();
  }
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

try {
  // Add is_admin column if it doesn't exist
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false
  `;
  console.log("✅ is_admin column added to users table (or already existed).");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
} finally {
  await sql.end();
}
