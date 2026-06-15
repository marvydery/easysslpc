import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export async function sendCertificateEmail(
  to: string,
  domain: string,
  certificateZipBuffer: Buffer
) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `SSL Certificate Ready for ${domain}`,
      html: `
        <h2>Your SSL Certificate is Ready!</h2>
        <p>Your SSL certificate for <strong>${domain}</strong> has been generated successfully.</p>
        <p>The certificate is attached to this email as a ZIP file. Please download and install it on your server.</p>
        <p>The certificate will expire in 90 days. ${
          domain.includes("bridge")
            ? "Don't worry - we'll automatically renew it for you!"
            : "Please renew it manually before expiration."
        }</p>
        <br>
        <p>Best regards,<br>EasySSL Team</p>
      `,
      attachments: [
        {
          filename: `${domain}-ssl-certificate.zip`,
          content: certificateZipBuffer,
        },
      ],
    });
    console.log(`Certificate email sent to ${to} for domain ${domain}`);
  } catch (error) {
    console.error("Failed to send certificate email:", error);
    throw error;
  }
}

export async function sendRenewalNotification(
  to: string,
  domain: string,
  daysRemaining: number
) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `SSL Certificate Expiring Soon - ${domain}`,
      html: `
        <h2>SSL Certificate Expiring Soon</h2>
        <p>Your SSL certificate for <strong>${domain}</strong> will expire in <strong>${daysRemaining} days</strong>.</p>
        <p>Please log in to your dashboard to renew your certificate.</p>
        <br>
        <p>Best regards,<br>EasySSL Team</p>
      `,
    });
    console.log(`Renewal notification sent to ${to} for domain ${domain}`);
  } catch (error) {
    console.error("Failed to send renewal notification:", error);
  }
}

export async function sendBridgeFailureWarning(
  to: string,
  domain: string,
  daysUntilExpiry: number,
  bridgeUrl: string
) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `⚠️ Action Required: SSL Auto-Renewal Blocked for ${domain}`,
      html: `
        <h2>⚠️ Your SSL Auto-Renewal Cannot Proceed</h2>
        <p>
          EasySSL attempted to automatically renew your SSL certificate for
          <strong>${domain}</strong>, but the renewal is blocked because your
          <strong>bridge.php file is not reachable</strong>.
        </p>

        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:16px;margin:16px 0;">
          <strong>Your certificate expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}.</strong><br>
          Without action, your site will show SSL errors when it expires.
        </div>

        <h3>What to do</h3>
        <ol>
          <li>Log in to your hosting control panel (cPanel, Plesk, etc.)</li>
          <li>Go to <strong>File Manager → public_html → .well-known → acme-challenge</strong></li>
          <li>Make sure <strong>bridge.php</strong> is present in that folder</li>
          <li>If it's missing, download it again from your
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">EasySSL Dashboard</a>
            and re-upload it</li>
          <li>Once uploaded, visit this URL to confirm it works:<br>
            <a href="${bridgeUrl}">${bridgeUrl}</a>
          </li>
        </ol>

        <p>
          Once bridge.php is reachable, EasySSL will automatically retry the renewal
          in the next daily run (2–3 AM UTC).
        </p>

        <p>
          If you need help, reply to this email or visit your
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">dashboard</a>.
        </p>

        <br>
        <p>Best regards,<br>EasySSL Team</p>
      `,
    });
    console.log(`Bridge failure warning sent to ${to} for domain ${domain}`);
  } catch (error) {
    console.error("Failed to send bridge failure warning:", error);
  }
}
