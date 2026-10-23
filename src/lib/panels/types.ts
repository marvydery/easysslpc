export type PanelType = "cpanel" | "plesk" | "directadmin";

export interface PanelCredentials {
  /** Hostname with port, e.g. "server123.host.com:2083" */
  host: string;
  username: string;
  token: string;
}

/**
 * What EasySSL needs from a hosting control panel to renew without the
 * customer: put a challenge file in the site's folder, and install the result.
 */
export interface PanelAdapter {
  /** Absolute document root of the domain's website */
  getDocRoot(domain: string): Promise<string>;
  /** Confirms the token is allowed to manage SSL (read-only call) */
  checkSslAccess(): Promise<void>;
  writeChallenge(docRoot: string, token: string, content: string): Promise<void>;
  removeChallenge(docRoot: string, token: string): Promise<void>;
  installCertificate(domain: string, cert: string, key: string, caBundle: string): Promise<void>;
}

/** An error whose message is safe and useful to show the customer. */
export class PanelError extends Error {}
