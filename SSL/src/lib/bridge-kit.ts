/**
 * Generate Bridge Kit files for automatic SSL renewal
 */

export function generateBridgePHP(domain: string, bridgeSecret: string, apiUrl: string): string {
  return `<?php
/**
 * EasySSL Bridge File
 * This file enables automatic SSL certificate renewal
 * Domain: ${domain}
 * DO NOT DELETE THIS FILE
 */

// Get the token from the URL
$uri = $_SERVER['REQUEST_URI'];
$token = basename($uri);

// Your domain and bridge secret
$domain = '${domain}';
$bridgeSecret = '${bridgeSecret}';

// EasySSL API endpoint
$apiUrl = '${apiUrl}/api/bridge';

// Build the request URL
$url = $apiUrl . '?' . http_build_query([
    'domain' => $domain,
    'token' => $token,
    'secret' => $bridgeSecret
]);

// Make the request to EasySSL API
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Return the response
if ($httpCode === 200 && $response) {
    header('Content-Type: text/plain');
    echo $response;
} else {
    header('HTTP/1.1 404 Not Found');
    echo 'Challenge not found';
}
?>`;
}

export function generateHtaccess(): string {
  return `# EasySSL Bridge Configuration
# Redirect all ACME challenge requests to bridge.php

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_URI} ^/.well-known/acme-challenge/
    RewriteRule ^.well-known/acme-challenge/(.*)$ /bridge.php [L,QSA]
</IfModule>`;
}

export function generateReadme(domain: string): string {
  return `# EasySSL Bridge Kit for ${domain}

## Installation Instructions

1. **Upload Files**
   - Upload \`bridge.php\` to your website's root directory
   - Upload \`.htaccess\` to your website's root directory (or append the rules if .htaccess already exists)

2. **Verify Installation**
   - Make sure both files are accessible
   - The bridge.php file should be at: http://${domain}/bridge.php
   - The .htaccess rewrite rules should work

3. **Important Notes**
   - DO NOT delete these files! They enable automatic SSL renewal
   - Your SSL certificate will be automatically renewed every 90 days
   - You'll receive an email with the new certificate each time

4. **File Permissions**
   - bridge.php should be readable (644 or 755)
   - .htaccess should be readable (644)

## Troubleshooting

If automatic renewal fails:
- Check that both files exist and are accessible
- Verify that mod_rewrite is enabled on your server
- Check file permissions
- Contact support at support@easyssl.com

## Security

The bridge.php file contains a unique secret key that authenticates your domain with our servers. Keep this file secure and do not share it publicly.
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

  // Add files to ZIP
  zip.file('bridge.php', generateBridgePHP(domain, bridgeSecret, apiUrl));
  zip.file('.htaccess', generateHtaccess());
  zip.file('README.txt', generateReadme(domain));

  // Generate ZIP buffer
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer;
}
