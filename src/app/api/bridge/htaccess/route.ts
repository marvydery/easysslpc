import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/bridge/htaccess
 * Returns the .htaccess file needed in the acme-challenge folder.
 */
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const htaccess = `Options -Indexes
RewriteEngine On

# Serve existing files directly (manual verification files)
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]

# Route all other token requests through bridge.php
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^([a-zA-Z0-9_\\-]+)$ bridge.php?token=$1 [L,QSA]
`;

  return new NextResponse(htaccess, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=".htaccess"; filename*=UTF-8''%2Ehtaccess`,
    },
  });
}
