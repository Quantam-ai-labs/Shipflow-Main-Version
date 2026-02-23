import { Resend } from 'resend';

async function getCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  let apiKey: string | undefined;
  let fromEmail: string | undefined;

  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? 'repl ' + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

    if (hostname && xReplitToken) {
      const freshSettings = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken,
          },
        }
      ).then(res => res.json()).then(data => data.items?.[0]);

      if (freshSettings?.settings?.api_key && freshSettings.settings.api_key.startsWith('re_')) {
        apiKey = freshSettings.settings.api_key;
        fromEmail = freshSettings.settings.from_email;
      }
    }
  } catch (e) {
    console.warn('[Email] Connector fetch failed, falling back to env secret');
  }

  if (!apiKey && process.env.RESEND_API_KEY) {
    apiKey = process.env.RESEND_API_KEY;
  }

  if (!apiKey) {
    throw new Error('No valid Resend API key found. Set RESEND_API_KEY secret or configure the Resend integration.');
  }

  return {
    apiKey,
    fromEmail: fromEmail || 'ShipFlow <onboarding@resend.dev>',
  };
}

async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return { client: new Resend(apiKey), fromEmail };
}

interface InviteEmailParams {
  toEmail: string;
  merchantName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  invitedByName?: string;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    const { toEmail, merchantName, role, inviteUrl, expiresAt, invitedByName } = params;

    const roleName = role.charAt(0).toUpperCase() + role.slice(1);
    const expiryStr = expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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
            ${invitedByName ? `<strong>${invitedByName}</strong> has invited you` : 'You have been invited'} to join <strong>${merchantName}</strong> on ShipFlow as a <strong>${roleName}</strong>.
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

    const result = await client.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `You've been invited to ${merchantName} on ShipFlow`,
      html: htmlBody,
      text: textBody,
    });

    if (result.error) {
      console.error('[Email] Resend error:', result.error);
      return { success: false, error: result.error.message || 'Email send failed' };
    }

    console.log(`[Email] Invite sent to ${toEmail} (id: ${result.data?.id})`);
    return { success: true };
  } catch (err: any) {
    console.error('[Email] Failed to send invite:', err.message);
    return { success: false, error: err.message };
  }
}

interface MerchantSetupEmailParams {
  toEmail: string;
  merchantName: string;
  firstName: string;
  setupUrl: string;
  expiresAt: Date;
}

export async function sendMerchantSetupEmail(params: MerchantSetupEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    const { toEmail, merchantName, firstName, setupUrl } = params;

    const result = await client.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `You're invited to ${merchantName} on ShipFlow`,
      html: `<p>Hi ${firstName},</p><p>You've been invited to join <strong>${merchantName}</strong> on ShipFlow.</p><p><a href="${setupUrl}">Accept Invitation</a></p>`,
      text: `Hi ${firstName}, you've been invited to join ${merchantName} on ShipFlow. Accept your invitation: ${setupUrl}`,
    });

    if (result.error) {
      console.error('[Email] Resend error:', JSON.stringify(result.error));
      return { success: false, error: result.error.message || JSON.stringify(result.error) };
    }

    console.log(`[Email] Invite sent to ${toEmail} (id: ${result.data?.id})`);
    return { success: true };
  } catch (err: any) {
    console.error('[Email] Failed to send invite:', err.message);
    return { success: false, error: err.message || 'Unknown email error' };
  }
}

export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; error?: string; provider?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    const result = await client.emails.send({
      from: "onboarding@resend.dev",
      to: [toEmail],
      subject: 'ShipFlow Test Email',
      html: '<h2>Test Email</h2><p>If you received this, email sending is working correctly.</p>',
      text: 'Test Email - If you received this, email sending is working correctly.',
    });

    if (result.error) {
      return { success: false, error: result.error.message, provider: 'resend' };
    }
    return { success: true, provider: 'resend' };
  } catch (err: any) {
    return { success: false, error: err.message, provider: 'resend' };
  }
}
