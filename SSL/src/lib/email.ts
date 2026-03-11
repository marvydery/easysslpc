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
