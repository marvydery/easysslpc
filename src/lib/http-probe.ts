import * as http from "http";
import * as https from "https";

export interface ProbeResult {
  ok: boolean;
  status: number;
  content: string;
  finalUrl: string;
  error?: string;
}

const MAX_BODY = 64 * 1024;

/**
 * GETs a URL the way Let's Encrypt's validator does: follows redirects
 * (including http → https) and ignores invalid/expired/self-signed
 * certificates, so sites with a broken cert can still be verified.
 */
export function probeUrl(url: string, timeoutMs = 8000, redirectsLeft = 10): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return resolve({ ok: false, status: 0, content: "", finalUrl: url, error: "Invalid URL" });
    }

    const isHttps = parsed.protocol === "https:";
    const options: https.RequestOptions = {
      timeout: timeoutMs,
      headers: { "User-Agent": "EasySSL-Validator/1.0", Accept: "*/*" },
      ...(isHttps ? { rejectUnauthorized: false } : {}),
    };

    const req = (isHttps ? https : http).get(url, options, (res) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          return resolve({ ok: false, status, content: "", finalUrl: url, error: "Too many redirects" });
        }
        const next = new URL(res.headers.location, url).toString();
        return resolve(probeUrl(next, timeoutMs, redirectsLeft - 1));
      }

      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        if (data.length < MAX_BODY) data += chunk;
      });
      res.on("end", () => resolve({ ok: status === 200, status, content: data, finalUrl: url }));
      res.on("error", (err) =>
        resolve({ ok: false, status, content: "", finalUrl: url, error: err.message })
      );
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, content: "", finalUrl: url, error: "Timed out" });
    });
    req.on("error", (err) =>
      resolve({ ok: false, status: 0, content: "", finalUrl: url, error: err.message })
    );
  });
}

export function challengeUrl(domain: string, token: string): string {
  return `http://${domain}/.well-known/acme-challenge/${token}`;
}

/** True when the domain serves exactly the expected key authorization for the token. */
export async function checkChallengeServed(
  domain: string,
  token: string,
  keyAuthorization: string
): Promise<{ ok: boolean; url: string; reason?: string }> {
  const url = challengeUrl(domain, token);
  const res = await probeUrl(url);
  if (!res.ok) {
    return {
      ok: false,
      url,
      reason: res.error ? `could not connect (${res.error})` : `got HTTP ${res.status}`,
    };
  }
  if (res.content.trim() !== keyAuthorization.trim()) {
    return { ok: false, url, reason: "file content does not match" };
  }
  return { ok: true, url };
}
