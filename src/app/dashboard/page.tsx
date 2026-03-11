import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Lock, Plus, Crown, ShieldCheck } from "lucide-react";
import { getDomainLimit, getDomainLimitLabel } from "@/lib/plans";
import DashboardClient from "@/components/DashboardClient";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

export default async function DashboardPage() {
  const { userId } = auth();
  const user = await currentUser();

  if (!userId || !user) {
    redirect("/sign-in");
  }

  const userEmail = user.emailAddresses[0]?.emailAddress || "";
  const isAdminEmail = !!ADMIN_EMAIL && userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Get or create user in database
  let dbUser = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);

  if (dbUser.length === 0) {
    // Create user — auto-grant admin/lifetime if email matches ADMIN_EMAIL
    await db.insert(users).values({
      clerkId: userId,
      email: userEmail,
      subscriptionTier: isAdminEmail ? "lifetime" : "free",
      isAdmin: isAdminEmail,
    });

    dbUser = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);
  } else if (isAdminEmail && (!dbUser[0].isAdmin || dbUser[0].subscriptionTier !== "lifetime")) {
    // Upgrade existing user to admin/lifetime if they weren't already
    await db
      .update(users)
      .set({ isAdmin: true, subscriptionTier: "lifetime" })
      .where(eq(users.clerkId, userId));

    dbUser = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);
  }

  const currentDbUser = dbUser[0];
  const domainLimit = getDomainLimit(currentDbUser.subscriptionTier, currentDbUser.isAdmin);
  const domainLimitLabel = getDomainLimitLabel(currentDbUser.subscriptionTier, currentDbUser.isAdmin);

  // Get user's domains with latest certificates
  const userDomains = await db
    .select({
      domain: domains,
      certificate: certificates,
    })
    .from(domains)
    .leftJoin(certificates, eq(domains.id, certificates.domainId))
    .where(eq(domains.userId, currentDbUser.id))
    .orderBy(desc(certificates.createdAt));

  // Group by domain (get latest certificate for each)
  const domainMap = new Map();
  for (const row of userDomains) {
    if (!domainMap.has(row.domain.id)) {
      domainMap.set(row.domain.id, row);
    }
  }
  const uniqueDomains = Array.from(domainMap.values());
  
  // Only count domains with certificates towards the limit
  const domainsWithCertificates = uniqueDomains.filter(d => d.certificate !== null);
  const canAddMore = currentDbUser.isAdmin || domainsWithCertificates.length < domainLimit;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Lock className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold">EasySSL Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            {currentDbUser.isAdmin && (
              <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
                <Crown className="w-3 h-3" />
                Admin
              </span>
            )}
            <span className="text-sm text-gray-600">
              Plan:{" "}
              <span className="font-medium capitalize">
                {currentDbUser.subscriptionTier}
              </span>
            </span>
            <Link
              href="/sign-out"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm text-gray-600 mb-2">Active Certificates</h3>
            <p className="text-3xl font-bold">{domainsWithCertificates.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm text-gray-600 mb-2">Domain Limit</h3>
            <p className="text-3xl font-bold">{domainLimitLabel}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm text-gray-600 mb-2">Auto-Renewal</h3>
            <p className="text-3xl font-bold">
              {uniqueDomains.filter((d) => d.domain.autoRenewEnabled).length}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm text-gray-600 mb-2">Subscription</h3>
            <p className="text-3xl font-bold capitalize">
              {currentDbUser.subscriptionTier}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6 flex items-center gap-4">
          {canAddMore ? (
            <Link
              href="/dashboard/generate"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Plus className="w-5 h-5" />
              Generate New Certificate
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <button
                disabled
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-300 text-gray-500 rounded-lg font-medium cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
                Generate New Certificate
              </button>
              <p className="text-sm text-red-600 font-medium">
                Domain limit reached ({domainsWithCertificates.length}/{domainLimit}).{" "}
                <Link href="/dashboard/upgrade" className="underline">
                  Upgrade your plan
                </Link>{" "}
                to add more.
              </p>
            </div>
          )}
        </div>

        {/* Domain usage bar (non-admin only) */}
        {!currentDbUser.isAdmin && (
          <div className="mb-6 bg-white p-4 rounded-lg shadow flex items-center gap-4">
            <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Certificates used</span>
                <span className="font-medium">
                  {domainsWithCertificates.length} / {domainLimit}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    domainsWithCertificates.length >= domainLimit
                      ? "bg-red-500"
                      : domainsWithCertificates.length >= domainLimit * 0.8
                      ? "bg-yellow-500"
                      : "bg-blue-500"
                  }`}
                  style={{
                    width: `${Math.min(
                      (domainsWithCertificates.length / domainLimit) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Domains Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold">Your SSL Certificates</h2>
          </div>

          {uniqueDomains.length === 0 ? (
            <div className="p-12 text-center">
              <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No certificates yet
              </h3>
              <p className="text-gray-600 mb-6">
                Generate your first SSL certificate to get started
              </p>
              <Link
                href="/dashboard/generate"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                <Plus className="w-5 h-5" />
                Generate Certificate
              </Link>
            </div>
          ) : (
            <DashboardClient
              domains={uniqueDomains}
              userTier={currentDbUser.subscriptionTier}
            />
          )}
        </div>

        {/* Upgrade CTA — only for non-admin free users */}
        {currentDbUser.subscriptionTier === "free" && !currentDbUser.isAdmin && (
          <div className="mt-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-8 text-white">
            <h3 className="text-2xl font-bold mb-2">
              Upgrade for Automatic Renewals & More Domains
            </h3>
            <p className="text-blue-100 mb-2">
              <strong>Pro</strong> — $29/year · up to 5 domains · auto-renewal
            </p>
            <p className="text-blue-100 mb-6">
              <strong>Lifetime</strong> — $49 once · up to 10 domains · auto-renewal forever
            </p>
            <Link
              href="/dashboard/upgrade"
              className="inline-block px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
            >
              Upgrade Now
            </Link>
          </div>
        )}

        {/* Admin banner */}
        {currentDbUser.isAdmin && (
          <div className="mt-8 bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg p-6 text-white flex items-center gap-4">
            <Crown className="w-8 h-8 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-bold">Admin Account</h3>
              <p className="text-amber-100 text-sm">
                You have unlimited domain access and lifetime tier privileges.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
