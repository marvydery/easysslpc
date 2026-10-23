/**
 * cPanel adapter — uses UAPI (and API 2 where UAPI has no equivalent) over
 * HTTPS on port 2083, authenticated with a cPanel API token:
 *   Authorization: cpanel <username>:<token>
 */
import { PanelAdapter, PanelCredentials, PanelError } from "./types";

export const CPANEL_DEFAULT_PORT = 2083;

type Params = Record<string, string>;

function describeNetworkError(err: any, host: string): string {
  const code = err?.cause?.code ?? err?.code ?? "";
  const name = err?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return `Timed out connecting to ${host}. Check the server address, and that your host allows connections to port 2083.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `Couldn't find a server called ${host.split(":")[0]}. Use the address you open cPanel with (the part before :2083).`;
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET") {
    return `${host} refused the connection. Check the address and port (cPanel uses 2083).`;
  }
  if (/CERT|SELF_SIGNED|ALTNAME|UNABLE_TO_VERIFY/i.test(code)) {
    return `The security certificate on ${host} isn't valid for that address (it may be expired, self-signed or issued for another name). Try your server's hostname from cPanel → Server Information.`;
  }
  return `Couldn't connect to ${host} (${code || err?.message || "unknown error"}).`;
}

export class CpanelAdapter implements PanelAdapter {
  constructor(private creds: PanelCredentials) {}

  private async request(path: string, params: Params, method: "GET" | "POST"): Promise<any> {
    const body = new URLSearchParams(params);
    const url = `https://${this.creds.host}${path}${method === "GET" ? `?${body}` : ""}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `cpanel ${this.creds.username}:${this.creds.token}`,
          ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: method === "POST" ? body : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
    } catch (err) {
      throw new PanelError(describeNetworkError(err, this.creds.host));
    }

    if (res.status === 401 || res.status === 403) {
      throw new PanelError("cPanel rejected the username or API token. Check both, and that the token hasn't expired.");
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new PanelError(`cPanel returned an unexpected response (HTTP ${res.status}). Is ${this.creds.host} a cPanel server?`);
    }
  }

  private async uapi(module: string, fn: string, params: Params = {}): Promise<any> {
    const json = await this.request(`/execute/${module}/${fn}`, params, "POST");
    if (json?.status !== 1) {
      const errors: string[] = json?.errors ?? [];
      throw new PanelError(errors.join(" ") || `cPanel couldn't run ${module}::${fn}.`);
    }
    return json.data;
  }

  private async api2(module: string, fn: string, params: Params = {}): Promise<any> {
    const json = await this.request(
      "/json-api/cpanel",
      {
        cpanel_jsonapi_user: this.creds.username,
        cpanel_jsonapi_apiversion: "2",
        cpanel_jsonapi_module: module,
        cpanel_jsonapi_func: fn,
        ...params,
      },
      "GET"
    );
    const result = json?.cpanelresult;
    if (!result || result.error || result.data?.[0]?.result === 0) {
      throw new PanelError(result?.error || result?.data?.[0]?.reason || `cPanel couldn't run ${module}::${fn}.`);
    }
    return result.data;
  }

  async getDocRoot(domain: string): Promise<string> {
    let data: any;
    try {
      data = await this.uapi("DomainInfo", "single_domain_data", { domain });
    } catch (err) {
      if (err instanceof PanelError && /not|own|exist/i.test(err.message)) {
        throw new PanelError(`${domain} isn't on this cPanel account. Connect the account that hosts this domain.`);
      }
      throw err;
    }
    const root = data?.documentroot;
    if (!root) throw new PanelError(`cPanel didn't report a website folder for ${domain}.`);
    return String(root).replace(/\/+$/, "");
  }

  async checkSslAccess(): Promise<void> {
    try {
      await this.uapi("SSL", "installed_hosts");
    } catch (err) {
      throw new PanelError(
        `This token can't manage SSL certificates${err instanceof Error ? ` (${err.message})` : ""}. Create a token without restrictions, or one that includes SSL.`
      );
    }
  }

  async writeChallenge(docRoot: string, token: string, content: string): Promise<void> {
    const dir = `${docRoot}/.well-known/acme-challenge`;
    const save = () => this.uapi("Fileman", "save_file_content", { dir, file: token, content });
    try {
      await save();
    } catch {
      // The folders may not exist yet; create them (ignoring "already exists") and retry
      await this.api2("Fileman", "mkdir", { path: docRoot, name: ".well-known" }).catch(() => {});
      await this.api2("Fileman", "mkdir", { path: `${docRoot}/.well-known`, name: "acme-challenge" }).catch(() => {});
      await save();
    }
  }

  async removeChallenge(docRoot: string, token: string): Promise<void> {
    await this.api2("Fileman", "fileop", {
      op: "unlink",
      sourcefiles: `${docRoot}/.well-known/acme-challenge/${token}`,
      doubledecode: "0",
    }).catch(() => {});
  }

  async installCertificate(domain: string, cert: string, key: string, caBundle: string): Promise<void> {
    await this.uapi("SSL", "install_ssl", { domain, cert, key, ...(caBundle ? { cabundle: caBundle } : {}) });
  }
}
