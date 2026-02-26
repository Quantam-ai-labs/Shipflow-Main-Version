import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

function getSESClient() {
  const region = process.env.AWS_SES_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS SES credentials not configured. Set AWS_SES_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.");
  }

  return new SESClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getFromEmail(): string {
  return process.env.AWS_SES_FROM_EMAIL || "ShipFlow <noreply@shipflow.app>";
}

interface InviteEmailParams {
  toEmail: string;
  merchantName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  invitedByName?: string;
}

interface PasswordResetEmailParams {
  toEmail: string;
  resetUrl: string;
  firstName: string;
  expiresAt: Date;
}

export async function sendPasswordResetEmailSES(params: PasswordResetEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getSESClient();
    const { toEmail, resetUrl, firstName, expiresAt } = params;

    const expiryStr = expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" });

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#18181b;padding:24px 32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">ShipFlow</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#18181b;">Reset Your Password</h2>
          <p style="margin:0 0 8px;color:#3f3f46;font-size:14px;line-height:1.6;">
            Hi <strong>${firstName}</strong>, we received a request to reset your password.
          </p>
          <p style="margin:0 0 24px;color:#71717a;font-size:13px;line-height:1.5;">
            Click the button below to set a new password. If you didn't request this, you can safely ignore this email.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${resetUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;">
              Reset Password
            </a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;line-height:1.5;text-align:center;">
            Or copy this link: <br/>
            <a href="${resetUrl}" style="color:#3b82f6;word-break:break-all;">${resetUrl}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;"/>
          <p style="margin:0;color:#a1a1aa;font-size:11px;text-align:center;">
            This link expires on ${expiryStr}. For security, do not share this link.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textBody = `Hi ${firstName},\n\nWe received a request to reset your password.\n\nReset your password: ${resetUrl}\n\nThis link expires on ${expiryStr}.\n\nIf you didn't request this, you can safely ignore this email.`;

    const command = new SendEmailCommand({
      Source: getFromEmail(),
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: "Reset your ShipFlow password", Charset: "UTF-8" },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    });

    const result = await client.send(command);
    console.log(`[SES] Password reset email sent to ${toEmail} (messageId: ${result.MessageId})`);
    return { success: true };
  } catch (err: any) {
    console.error("[SES] Failed to send password reset email:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendInviteEmailSES(params: InviteEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getSESClient();
    const { toEmail, merchantName, role, inviteUrl, expiresAt, invitedByName } = params;

    const roleName = role.charAt(0).toUpperCase() + role.slice(1);
    const expiryStr = expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#18181b;padding:24px 32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">ShipFlow</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#18181b;">You're Invited!</h2>
          <p style="margin:0 0 8px;color:#3f3f46;font-size:14px;line-height:1.6;">
            ${invitedByName ? `<strong>${invitedByName}</strong> has invited you` : "You have been invited"} to join <strong>${merchantName}</strong> on ShipFlow as a <strong>${roleName}</strong>.
          </p>
          <p style="margin:0 0 24px;color:#71717a;font-size:13px;line-height:1.5;">
            ShipFlow is a logistics operations platform for managing Shopify orders, courier shipments, and COD reconciliation.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${inviteUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;">
              Accept Invitation
            </a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;line-height:1.5;text-align:center;">
            Or copy this link: <br/>
            <a href="${inviteUrl}" style="color:#3b82f6;word-break:break-all;">${inviteUrl}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;"/>
          <p style="margin:0;color:#a1a1aa;font-size:11px;text-align:center;">
            This invitation expires on ${expiryStr}. If you didn't expect this, you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const textBody = `You're invited to join ${merchantName} on ShipFlow as a ${roleName}.\n\nAccept your invitation: ${inviteUrl}\n\nThis invitation expires on ${expiryStr}.`;

    const command = new SendEmailCommand({
      Source: getFromEmail(),
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: `You've been invited to ${merchantName} on ShipFlow`, Charset: "UTF-8" },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    });

    const result = await client.send(command);
    console.log(`[SES] Invite sent to ${toEmail} (messageId: ${result.MessageId})`);
    return { success: true };
  } catch (err: any) {
    console.error("[SES] Failed to send invite:", err.message);
    return { success: false, error: err.message };
  }
}
