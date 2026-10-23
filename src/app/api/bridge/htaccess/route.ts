import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateHtaccess } from "@/lib/bridge-kit";

/**
 * GET /api/bridge/htaccess
 * Returns the .htaccess file needed in the acme-challenge folder.
 */
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return new NextResponse(generateHtaccess(), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=".htaccess"; filename*=UTF-8''%2Ehtaccess`,
    },
  });
}
