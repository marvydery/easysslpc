/**
 * src/app/api/admin/settings/route.ts
 * GET  — fetch all settings
 * POST — update settings
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAllSettings, setSettings, SettingKey } from "@/lib/settings";

async function getAdminUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await getAdminUser(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const settings = await getAllSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await getAdminUser(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    await setSettings(body as Partial<Record<SettingKey, string>>);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
