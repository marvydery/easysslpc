/**
 * Generate Bridge Kit files for automatic SSL renewal
 */

export function generateBridgePHP(domain: string, bridgeSecret: string, apiUrl: string): string {
  // Strip trailing slash to prevent double-slash in the API URL
  const baseUrl = apiUrl.replace(/\/+$/, '');

  return `<?php
/**
 * EasySSL Bridge Protocol
 * ========================
 * Domain  : ${domain}
 * Generated: ${new Date().toLocaleDateString()}
 *
 * INSTALLATION:
 * 1. Upload this file to: public_html/.well-known/acme-challenge/bridge.php
 * 2. Upload the .htaccess file to: public_html/.well-known/acme-challenge/.htaccess
 * 3. That's it! Certificate renewals will happen automatically.
 *
 * DO NOT share this file — it contains your unique bridge secret.
 */

define('BRIDGE_SECRET', '${bridgeSecret}');
define('EASYSSL_API',   '${baseUrl}/api/bridge');

$token = isset($_GET['token']) ? preg_replace('/[^a-zA-Z0-9_\\-]/', '', $_GET['token']) : '';

if (empty($token)) {
    http_response_code(400);
    exit('Bad Request');
}

$url = EASYSSL_API . '?' . http_build_query(['token' => $token, 'secret' => BRIDGE_SECRET]);
$response = @file_get_contents($url, false, stream_context_create([
    'http' => ['timeout' => 10, 'ignore_errors' => true],
]));

if ($response === false || empty(trim($response))) {
    http_response_code(404);
    exit('Not Found');
}

header('Content-Type: text/plain');
header('Cache-Control: no-store');
echo trim($response);
?>`;
}

export function generateHtaccess(): string {
  return `# EasySSL Bridge Configuration
# Serves ACME challenge tokens via bridge.php

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^(.*)$ bridge.php [L,QSA]
</IfModule>`;
}

export function generateReadme(domain: string): string {
  return `# EasySSL Bridge Kit for ${domain}

## Installation Instructions

1. **Upload Files**
   - Upload \`bridge.php\` to: public_html/.well-known/acme-challenge/bridge.php
   - Upload \`.htaccess\` to: public_html/.well-known/acme-challenge/.htaccess

2. **Verify Installation**
   - Visit: http://${domain}/.well-known/acme-challenge/bridge.php
   - You should NOT see a PHP error — a 400 Bad Request response means it is working correctly

3. **Important Notes**
   - DO NOT delete these files — they enable automatic SSL renewal
   - Your SSL certificate will be automatically renewed before it expires
   - You will receive an email with the new certificate each time it renews

4. **File Permissions**
   - bridge.php: 644
   - .htaccess: 644

## Troubleshooting

If automatic renewal fails:
- Confirm both files are in public_html/.well-known/acme-challenge/
- Verify mod_rewrite is enabled on your server
- Check file permissions (644)
- Contact support at support@easyssl.com

## Security

bridge.php contains a unique secret key tied to your domain.
Do not share it or make it publicly accessible outside this directory.
`;
}

/**
 * Create a ZIP buffer containing all Bridge Kit files
 */
export async function createBridgeKitZip(
  domain: string,
  bridgeSecret: string,
  apiUrl: string
): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('bridge.php', generateBridgePHP(domain, bridgeSecret, apiUrl));
  zip.file('.htaccess', generateHtaccess());
  zip.file('README.txt', generateReadme(domain));

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer;
}
