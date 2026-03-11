// Migration: Add challenge columns to domains table
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
  // Add challenge columns
  await sql`
    ALTER TABLE domains
    ADD COLUMN IF NOT EXISTS validation_method varchar(50),
    ADD COLUMN IF NOT EXISTS challenge_token varchar(255),
    ADD COLUMN IF NOT EXISTS challenge_value text
  `;
  console.log("✅ Challenge columns added to domains table.");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
} finally {
  await sql.end();
}
