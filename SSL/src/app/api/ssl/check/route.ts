import { NextRequest, NextResponse } from "next/server";
import * as tls from "tls";

export const runtime = "nodejs";

interface CertInfo {
  domain: string;
  valid: boolean;
  subject: {
    CN?: string;
    O?: string;
    C?: string;
  };
  issuer: {
    CN?: string;
    O?: string;
    C?: string;
  };
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  serialNumber: string;
  fingerprint: string;
  subjectAltNames: string[];
}

function checkSSL(domain: string): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    // Strip protocol if present
    const cleanDomain = domain.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];

    const socket = tls.connect(
      {
        host: cleanDomain,
        port: 443,
        rejectUnauthorized: false,
        servername: cleanDomain,
      },
      () => {
        const cert = socket.getPeerCertificate(true);
        const authorized = socket.authorized;
        socket.destroy();

        if (!cert || !cert.subject) {
          reject(new Error("No certificate found for this domain"));
          return;
        }

        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.floor(
          (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Extract Subject Alternative Names
        const sanExtension = cert.subjectaltname || "";
        const subjectAltNames = sanExtension
          .split(", ")
          .filter((s: string) => s.startsWith("DNS:"))
          .map((s: string) => s.replace("DNS:", ""));

        // Helper to safely extract a single string value from cert fields
        const str = (v: string | string[] | undefined): string | undefined =>
          Array.isArray(v) ? v[0] : v;

        resolve({
          domain: cleanDomain,
          valid: authorized && daysRemaining > 0,
          subject: {
            CN: str(cert.subject?.CN),
            O: str(cert.subject?.O),
            C: str(cert.subject?.C),
          },
          issuer: {
            CN: str(cert.issuer?.CN),
            O: str(cert.issuer?.O),
            C: str(cert.issuer?.C),
          },
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysRemaining,
          serialNumber: cert.serialNumber || "",
          fingerprint: cert.fingerprint || "",
          subjectAltNames,
        });
      }
    );

    socket.on("error", (err) => {
      reject(new Error(`Connection failed: ${err.message}`));
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error("Connection timed out"));
    });
  });
}

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

    const certInfo = await checkSSL(domain.trim());
    return NextResponse.json(certInfo);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to check SSL certificate" },
      { status: 500 }
    );
  }
}
