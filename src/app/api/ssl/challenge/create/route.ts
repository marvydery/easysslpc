import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, acmeChallenges } from "@/lib/db/schema";
import { eq, count, and, inArray } from "drizzle-orm";
import { getDomainLimit } from "@/lib/plans";
import { buildDomainList } from "@/lib/acme";
import * as acme from "acme-client";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

/**
 * POST /api/ssl/challenge/create
 * Creates an ACME order, stores ALL challenge data to DB, returns file details.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domain: domainName, email, includeWww = false, useBridge = false } = body;

    if (!domainName || !email) {
      return NextResponse.json(
        { error: "Domain and email are required" },
        { status: 400 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.isAdmin) {
      const limit = getDomainLimit(user.subscriptionTier, user.isAdmin);
      const [{ value: domainCount }] = await db
        .select({ value: count() })
        .from(domains)
        .where(eq(domains.userId, user.id));

      if (domainCount >= limit) {
        return NextResponse.json(
          {
            error: `Domain limit reached. Your ${user.subscriptionTier} plan allows up to ${limit} domain${
              limit === 1 ? "" : "s"
            }. Please upgrade to add more.`,
          },
          { status: 403 }
        );
      }
    }

    const domainList = buildDomainList(domainName, includeWww);
    const apexDomain = domainList[0];

    // Create ACME client
    const accountKey = await acme.crypto.createPrivateKey();
    const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // Create CSR covering all domains
    const [csrKey, csr] = await acme.crypto.createCsr({
      commonName: apexDomain,
      altNames: domainList.length > 1 ? domainList : undefined,
    });

    const order = await client.createOrder({
      identifiers: domainList.map((d) => ({ type: "dns", value: d })),
    });

    const authorizations = await client.getAuthorizations(order);

    // Upsert domain record
    const existingDomains = await db
      .select()
      .from(domains)
      .where(and(eq(domains.userId, user.id), eq(domains.domainName, apexDomain)))
      .limit(1);

    let domainRecord;
    if (existingDomains.length > 0) {
      const [updated] = await db
        .update(domains)
        .set({ validationMethod: "http-01", autoRenewEnabled: useBridge, updatedAt: new Date() })
        .where(eq(domains.id, existingDomains[0].id))
        .returning();
      domainRecord = updated;
    } else {
      const [created] = await db
        .insert(domains)
        .values({ userId: user.id, domainName: apexDomain, validationMethod: "http-01", autoRenewEnabled: useBridge })
        .returning();
      domainRecord = created;
    }

    // Clear stale challenge rows
    await db
      .delete(acmeChallenges)
      .where(
        and(
          eq(acmeChallenges.userId, user.id),
          inArray(acmeChallenges.domain, domainList)
        )
      );

    // Persist challenge rows — one per domain
    const challenges: Array<{
      domain: string;
      token: string;
      keyAuthorization: string;
      filePath: string;
      fileContent: string;
    }> = [];

    for (const auth of authorizations) {
      const challenge = auth.challenges.find((c: any) => c.type === "http-01");
      if (!challenge) {
        return NextResponse.json(
          { error: `No HTTP-01 challenge for ${auth.identifier.value}` },
          { status: 400 }
        );
      }

      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

      await db.insert(acmeChallenges).values({
        userId: user.id,
        domain: auth.identifier.value,
        token: challenge.token,
        keyAuthorization,
        orderUrl: order.url,
        accountKeyPem: accountKey.toString(),
        csrKeyPem: csrKey.toString(),
        csrDer: csr.toString("base64"),
      });

      // Keep domain row in sync for apex
      if (auth.identifier.value === apexDomain) {
        await db
          .update(domains)
          .set({ challengeToken: challenge.token, challengeValue: keyAuthorization, updatedAt: new Date() })
          .where(eq(domains.id, domainRecord.id));
      }

      challenges.push({
        domain: auth.identifier.value,
        token: challenge.token,
        keyAuthorization,
        filePath: `/.well-known/acme-challenge/${challenge.token}`,
        fileContent: keyAuthorization,
      });
    }

    return NextResponse.json({
      success: true,
      domainId: domainRecord.id,
      challenges,
      challenge: challenges[0],
    });
  } catch (error: any) {
    console.error("Challenge creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create challenge" },
      { status: 500 }
    );
  }
}
