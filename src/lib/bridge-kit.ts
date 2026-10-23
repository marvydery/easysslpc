/**
 * Bridge Kit — the files Pro customers upload to
 * public_html/.well-known/acme-challenge/ to enable automatic renewal.
 *
 * bridge.php does three jobs:
 *  1. Serves Let's Encrypt challenge tokens by proxying them from /api/bridge
 *  2. ?action=info    — reports what the host supports (used by "Check Auto Renewal")
 *  3. ?action=install — downloads the latest certificate from EasySSL and
 *                        installs it with cPanel's UAPI (CLI, or API token fallback)
 */

export const BRIDGE_VERSION = 2;
export const BRIDGE_TEST_TOKEN = "easyssl-bridge-test";

export function generateBridgePHP(domain: string, bridgeSecret: string, apiUrl: string): string {
  const baseUrl = apiUrl.replace(/\/+$/, "");

  return `<?php
/**
 * EasySSL Bridge Protocol v${BRIDGE_VERSION}
 * ========================
 * Domain   : ${domain}
 * Generated: ${new Date().toISOString().slice(0, 10)}
 *
 * INSTALLATION:
 * 1. Upload this file to: public_html/.well-known/acme-challenge/bridge.php
 * 2. Upload the .htaccess file to: public_html/.well-known/acme-challenge/.htaccess
 * 3. Click "Check Auto Renewal" in your EasySSL dashboard.
 *
 * DO NOT share this file — it contains your unique bridge secret.
 */

define('BRIDGE_VERSION', ${BRIDGE_VERSION});
define('BRIDGE_SECRET', '${bridgeSecret}');
define('EASYSSL_API',   '${baseUrl}/api/bridge');

/*
 * OPTIONAL — automatic installation fallback.
 * Most cPanel hosts let EasySSL install renewed certificates without this.
 * If "Check Auto Renewal" says auto-install is unavailable, create a token in
 * cPanel -> Security -> Manage API Tokens and fill in both values below.
 */
define('CPANEL_USER', '');
define('CPANEL_API_TOKEN', '');

function easyssl_get($url, $timeout = 15) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_USERAGENT      => 'EasySSL-Bridge/' . BRIDGE_VERSION,
        ));
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($body !== false && $code === 200) ? $body : false;
    }
    if (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(array('http' => array('timeout' => $timeout, 'ignore_errors' => true)));
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false || empty($http_response_header)) return false;
        $status = '';
        foreach ($http_response_header as $h) {
            if (stripos($h, 'HTTP/') === 0) $status = $h;
        }
        return strpos($status, ' 200') !== false ? $body : false;
    }
    return false;
}

function easyssl_json($data) {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($data);
    exit;
}

function easyssl_can_shell() {
    if (!function_exists('shell_exec')) return false;
    $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
    return !in_array('shell_exec', $disabled, true);
}

function easyssl_uapi_path() {
    if (!easyssl_can_shell()) return '';
    foreach (array('/usr/local/cpanel/bin/uapi', '/usr/bin/uapi') as $p) {
        if (@is_executable($p)) return $p;
    }
    return trim((string) @shell_exec('command -v uapi 2>/dev/null'));
}

function easyssl_install() {
    $raw  = easyssl_get(EASYSSL_API . '/certificate?' . http_build_query(array('secret' => BRIDGE_SECRET)), 20);
    $cert = $raw ? json_decode($raw, true) : null;
    if (!$cert || empty($cert['cert']) || empty($cert['key']) || empty($cert['domain'])) {
        easyssl_json(array('installed' => false, 'method' => 'none', 'message' => 'Could not download the certificate from EasySSL.'));
    }

    $params = array('domain' => $cert['domain'], 'cert' => $cert['cert'], 'key' => $cert['key']);
    if (!empty($cert['cabundle'])) $params['cabundle'] = $cert['cabundle'];
    $errors = array();

    // 1) cPanel UAPI command line (works on most cPanel hosts)
    $uapi = easyssl_uapi_path();
    if ($uapi !== '') {
        $cmd = escapeshellarg($uapi) . ' --output=json SSL install_ssl';
        foreach ($params as $k => $v) {
            $cmd .= ' ' . escapeshellarg($k . '=' . rawurlencode($v));
        }
        $out = (string) @shell_exec($cmd . ' 2>&1');
        $res = json_decode($out, true);
        if (!empty($res['result']['status'])) {
            easyssl_json(array('installed' => true, 'method' => 'uapi', 'message' => 'Installed with cPanel UAPI.'));
        }
        $errors[] = !empty($res['result']['errors']) ? implode(' ', (array) $res['result']['errors']) : substr(trim($out), 0, 300);
    }

    // 2) cPanel API token over HTTPS (if configured above)
    if (CPANEL_USER !== '' && CPANEL_API_TOKEN !== '' && function_exists('curl_init')) {
        $ch = curl_init('https://127.0.0.1:2083/execute/SSL/install_ssl');
        curl_setopt_array($ch, array(
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($params),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => array('Authorization: cpanel ' . CPANEL_USER . ':' . CPANEL_API_TOKEN),
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_TIMEOUT        => 60,
        ));
        $out = curl_exec($ch);
        curl_close($ch);
        $res = $out ? json_decode($out, true) : null;
        if (!empty($res['status'])) {
            easyssl_json(array('installed' => true, 'method' => 'api_token', 'message' => 'Installed with your cPanel API token.'));
        }
        $errors[] = !empty($res['errors']) ? implode(' ', (array) $res['errors']) : 'cPanel API token request failed.';
    }

    easyssl_json(array(
        'installed' => false,
        'method'    => 'none',
        'message'   => $errors ? implode(' | ', $errors) : 'Your host does not allow automatic installation. Add a cPanel API token to bridge.php, or install the emailed certificate manually.',
    ));
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action === 'info') {
    easyssl_json(array(
        'version'   => BRIDGE_VERSION,
        'curl'      => function_exists('curl_init'),
        'fopen'     => (bool) ini_get('allow_url_fopen'),
        'uapi'      => easyssl_uapi_path() !== '',
        'api_token' => CPANEL_USER !== '' && CPANEL_API_TOKEN !== '',
    ));
}

if ($action === 'install') {
    easyssl_install();
}

$token = isset($_GET['token']) ? preg_replace('/[^a-zA-Z0-9_\\-]/', '', $_GET['token']) : '';
if ($token === '') {
    http_response_code(400);
    exit('Bad Request');
}

$response = easyssl_get(EASYSSL_API . '?' . http_build_query(array('token' => $token, 'secret' => BRIDGE_SECRET)), 10);
if ($response === false || trim($response) === '') {
    http_response_code(404);
    exit('Not Found');
}

header('Content-Type: text/plain');
header('Cache-Control: no-store');
echo trim($response);
`;
}

export function generateHtaccess(): string {
  return `# EasySSL Bridge — routes Let's Encrypt token requests through bridge.php
Options -Indexes
RewriteEngine On

# Serve existing files directly (manual verification files, bridge.php itself)
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]

# Route all other token requests through bridge.php
RewriteRule ^([a-zA-Z0-9_-]+)$ bridge.php?token=$1 [L,QSA]
`;
}
