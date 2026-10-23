import { NextRequest, NextResponse } from "next/server";
import { inspectCertificate } from "@/lib/ssl-inspect";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain } = body;

    if (!domain || typeof domain !== "string") {
      return NextResponse.json(
        { error: "A valid domain name is required" },
        { status: 400 }
      );
    }

    const certInfo = await inspectCertificate(domain.trim());
    return NextResponse.json(certInfo);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to check SSL certificate" },
      { status: 500 }
    );
  }
}
