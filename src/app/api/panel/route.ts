import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, users } from "@/lib/db/schema";
import { apexOf } from "@/lib/acme";
import { getRenewalDomainList } from "@/lib/renewal";
import {
  PANELS,
  PanelType,
  createAdapter,
  deletePanelConnection,
  getPanelConnection,
  normalizeHost,
  savePanelConnection,
  testPanelConnection,
} from "@/lib/panels";

export const maxDuration = 60;

async function loadOwnedDomain(domainId: string | null) {
  const { userId } = auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!domainId) return { error: NextResponse.json({ error: "domainId required" }, { status: 400 }) };

  const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
  if (!user) return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };

  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
    .limit(1);
  if (!domain) return { error: NextResponse.json({ error: "Domain not found" }, { status: 404 }) };

  return { user, domain };
}

/** GET /api/panel?domainId= — connection status (never returns the token) */
export async function GET(request: NextRequest) {
  try {
    const ctx = await loadOwnedDomain(request.nextUrl.searchParams.get("domainId"));
    if ("error" in ctx) return ctx.error;

    const conn = await getPanelConnection(ctx.domain.id);
    if (!conn) return NextResponse.json({ connected: false });
    return NextResponse.json({
      connected: true,
      panelType: conn.panelType,
      host: conn.host,
      username: conn.username,
      lastStatus: conn.lastStatus,
      lastMessage: conn.lastMessage,
      lastCheckedAt: conn.lastCheckedAt,
    });
  } catch (error: any) {
    console.error("[panel] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/panel — { domainId, panelType, host, username, token }
 * Runs the full end-to-end test and saves the connection only if it passes.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ctx = await loadOwnedDomain(body.domainId ?? null);
    if ("error" in ctx) return ctx.error;
    const { user, domain } = ctx;

    if (!["pro", "lifetime"].includes(user.subscriptionTier) && !user.isAdmin) {
      return NextResponse.json({ error: "Connecting a hosting panel requires a Pro or Lifetime plan." }, { status: 403 });
    }

    const panelType = body.panelType as PanelType;
    if (!PANELS[panelType]?.available) {
      return NextResponse.json({ error: "That hosting panel isn't supported yet." }, { status: 400 });
    }
    const hostInput = String(body.host ?? "").trim();
    const username = String(body.username ?? "").trim();
    const token = String(body.token ?? "").trim();
    if (!hostInput || !username || !token) {
      return NextResponse.json({ error: "Server address, username and API token are all required." }, { status: 400 });
    }

    const host = normalizeHost(hostInput, panelType);
    const adapter = createAdapter(panelType, host, username, token);
    const hosts = await getRenewalDomainList(domain);
    const result = await testPanelConnection(adapter, panelType, apexOf(domain.domainName), hosts);

    if (!result.ok) {
      return NextResponse.json({ ok: false, steps: result.steps }, { status: 422 });
    }

    await savePanelConnection({ userId: user.id, domainId: domain.id, panelType, host, username, token });
    await db
      .update(domains)
      .set({ autoRenewEnabled: true, updatedAt: new Date() })
      .where(eq(domains.id, domain.id));

    return NextResponse.json({ ok: true, steps: result.steps, host });
  } catch (error: any) {
    console.error("[panel] POST error:", error);
    return NextResponse.json({ error: error.message || "Could not connect" }, { status: 500 });
  }
}

/** DELETE /api/panel?domainId= — forget the connection and its token */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await loadOwnedDomain(request.nextUrl.searchParams.get("domainId"));
    if ("error" in ctx) return ctx.error;
    await deletePanelConnection(ctx.domain.id, ctx.user.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[panel] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
