import nodemailer from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Base Branded HTML Template Generator
 * Produces clean, cross-client responsive email HTML with AuraPrep clean light format.
 */
export function generateEmailHtml({
  preheader,
  title,
  subtitle,
  badgeText,
  mainContentHtml,
  actionButton,
  codeBadge,
  securityNote,
}: {
  preheader?: string;
  title: string;
  subtitle?: string;
  badgeText?: string;
  mainContentHtml: string;
  actionButton?: { label: string; url: string };
  codeBadge?: string;
  securityNote?: string;
}): string {
  const codeDigitsHtml = codeBadge
    ? codeBadge
        .split('')
        .map(
          (d) =>
            `<span style="display:inline-block; width:36px; height:44px; line-height:44px; font-size:22px; font-weight:700; font-family:'Courier New', monospace; background:#ffffff; color:#0f172a; border:1.5px solid #cbd5e1; border-radius:8px; margin:0 3px; text-align:center;">${d}</span>`
        )
        .join('')
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; color:#334155;">
  ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; padding:36px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:540px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Area -->
          <tr>
            <td style="padding:32px 36px 16px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:22px; font-weight:800; color:#0f172a; letter-spacing:-0.03em;">
                      AuraPrep<span style="color:#059669;">.</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:18px;">
                    <h1 style="margin:0; font-size:22px; font-weight:700; color:#0f172a; letter-spacing:-0.02em; line-height:1.3;">
                      ${title}
                    </h1>
                    ${
                      subtitle
                        ? `<p style="margin:6px 0 0; font-size:14px; color:#64748b; line-height:1.5;">${subtitle}</p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:6px 36px 28px;">
              <div style="font-size:15px; line-height:1.6; color:#334155;">
                ${mainContentHtml}
              </div>

              <!-- OTP Code Segment if present -->
              ${
                codeBadge
                  ? `
                <div style="margin:24px 0; padding:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; text-align:center;">
                  <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:#64748b; letter-spacing:0.06em; margin-bottom:12px;">Verification Code</div>
                  <div style="text-align:center;">
                    ${codeDigitsHtml}
                  </div>
                  <div style="font-size:12px; color:#64748b; margin-top:12px;">Valid for 15 minutes • Do not share with anyone</div>
                </div>
              `
                  : ''
              }

              <!-- Action Button (only button, no raw URL link text) -->
              ${
                actionButton
                  ? `
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;">
                  <tr>
                    <td align="center">
                      <a href="${actionButton.url}" target="_blank" style="display:inline-block; padding:13px 34px; background-color:#059669; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; border-radius:8px; text-align:center;">
                        ${actionButton.label}
                      </a>
                    </td>
                  </tr>
                </table>
              `
                  : ''
              }

              <!-- Professional, polite footnote if note present (no red alert box) -->
              ${
                securityNote
                  ? `
                <p style="margin:24px 0 0; font-size:13px; color:#64748b; line-height:1.5; border-top:1px solid #f1f5f9; padding-top:16px;">
                  ${securityNote}
                </p>
              `
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 36px 22px; background-color:#f8fafc; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="margin:0 0 4px; font-size:12px; color:#64748b; font-weight:500;">
                AuraPrep • Adaptive GRE Learning Platform
              </p>
              <p style="margin:0; font-size:11px; color:#94a3b8; line-height:1.4;">
                Visit <a href="https://auraprep.us.ci" style="color:#059669; text-decoration:none;">auraprep.us.ci</a> • Empowering GRE candidates worldwide
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Universal Mail Dispatcher
 * Priority 1: Unitpost REST API (https://www.unitpost.com/api/v1/email)
 * Priority 2: Nodemailer (SMTP credentials if configured)
 * Priority 3: Local Dev Preview / Test Mode (logs URL & never throws)
 */
export async function sendEmail({ to, subject, html, text }: SendMailOptions): Promise<{ success: boolean; id?: string; previewUrl?: string }> {
  const unitpostApiKey = process.env.UNITPOST_API_KEY;
  const fromEmail = process.env.UNITPOST_FROM_EMAIL || process.env.SMTP_FROM || 'AuraPrep <services@auraprep.us.ci>';

  // 1. Try Unitpost API first if key is present
  if (unitpostApiKey && unitpostApiKey.trim() !== '') {
    try {
      console.log(`[Mailer/Unitpost] Sending email to: ${to} | Subject: "${subject}" | From: ${fromEmail}`);
      const response = await fetch('https://www.unitpost.com/api/v1/email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${unitpostApiKey.trim()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'AuraPrep-Backend/1.0',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: typeof to === 'string' ? to : (Array.isArray(to) ? to[0] : String(to)),
          subject,
          html,
          text: text || subject,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as any;
        console.log(`[Mailer/Unitpost] Email successfully sent to ${to}. Message ID:`, data?.id || data?.data?.id || 'ok');
        return { success: true, id: data?.id || data?.data?.id };
      } else {
        const errText = await response.text();
        console.error(`[Mailer/Unitpost] Failed with status ${response.status}: ${errText}. Attempting fallback...`);
      }
    } catch (unitpostErr) {
      console.error('[Mailer/Unitpost] Network or API error:', unitpostErr);
    }
  }

  // 2. Secondary: Nodemailer with SMTP
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const info = await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        html,
        text: text || subject,
      });

      console.log(`[Mailer/SMTP] Email sent via SMTP to ${to}. Message ID:`, info.messageId);
      return { success: true, id: info.messageId };
    } catch (smtpErr) {
      console.warn('[Mailer/SMTP] Failed to send via SMTP:', smtpErr);
    }
  }

  // 3. Fallback / Test Mode: Create Ethereal test account or local logging
  try {
    const testAccount = await nodemailer.createTestAccount();
    const testTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const info = await testTransporter.sendMail({
      from: fromEmail,
      to,
      subject,
      html,
      text: text || subject,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    console.log(`[Mailer/DevTest] Email preview generated for ${to}: ${previewUrl}`);
    return { success: true, id: info.messageId, previewUrl };
  } catch (testErr) {
    console.log(`[Mailer/Mock] (Simulated Send) To: ${to} | Subject: "${subject}"`);
    return { success: true, id: 'mock-sent' };
  }
}

/**
 * Send 6-Digit Email Verification OTP for Sign Up
 */
export async function sendOtpEmail(toEmail: string, otpCode: string, name?: string) {
  const html = generateEmailHtml({
    preheader: `Your AuraPrep verification code is ${otpCode}.`,
    title: 'Verify Your Email Address',
    subtitle: name ? `Welcome, ${name}! Please confirm your email.` : "Please confirm your email address to continue.",
    mainContentHtml: `
      <p>Thank you for signing up with <strong>AuraPrep</strong>.</p>
      <p>Please enter the 6-digit verification code below to activate your account:</p>
    `,
    codeBadge: otpCode,
    securityNote: 'This verification code is valid for 15 minutes. Please do not share it with anyone.',
  });

  return sendEmail({
    to: toEmail,
    subject: `Your AuraPrep Verification Code: ${otpCode}`,
    html,
  });
}

/**
 * Send Account Created Welcome Email
 */
export async function sendWelcomeEmail(toEmail: string, name: string, username: string) {
  const loginUrl = 'https://auraprep.us.ci/login';

  const html = generateEmailHtml({
    preheader: `Welcome to AuraPrep, ${name}! Your account credentials are ready.`,
    title: `Welcome to AuraPrep, ${name}!`,
    subtitle: 'Your pathway to 330+ GRE scores starts today.',
    mainContentHtml: `
      <p>Congratulations! Your personal <strong>AuraPrep</strong> account has been successfully created.</p>
      
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:18px; margin:20px 0;">
        <div style="font-size:13px; font-weight:600; color:#0f172a; margin-bottom:8px;">Account Details:</div>
        <div style="font-size:14px; color:#334155; margin-bottom:4px;">👤 <strong>Full Name:</strong> ${name}</div>
        <div style="font-size:14px; color:#334155; margin-bottom:4px;">🆔 <strong>Username / Login:</strong> <code style="color:#059669; font-weight:700; background:#ecfdf5; padding:2px 6px; border-radius:4px;">${username}</code></div>
        <div style="font-size:14px; color:#334155;">✉️ <strong>Registered Email:</strong> ${toEmail}</div>
      </div>

      <p>Here is what is available on your dashboard:</p>
      <ul style="padding-left:20px; margin:14px 0; color:#475569; line-height:1.7;">
        <li><strong>ETS Trap Deconstruction:</strong> Eliminate false-equivalence and extreme language traps.</li>
        <li><strong>Vocabulary Hub:</strong> 1,200+ high-frequency GRE words with etymology across 6 languages.</li>
        <li><strong>Adaptive Practice Area:</strong> Section-level pacing and cognitive error telemetry.</li>
      </ul>
    `,
    actionButton: {
      label: 'Access Your Dashboard',
      url: loginUrl,
    },
    securityNote: 'For account security, we recommend enabling Two-Factor Authentication from your Settings.',
  });

  return sendEmail({
    to: toEmail,
    subject: `Welcome to AuraPrep, ${name}! Your Account is Ready`,
    html,
  });
}

/**
 * Send Password Reset Link Email
 */
export async function sendPasswordResetEmail(toEmail: string, name: string, resetUrl: string) {
  const html = generateEmailHtml({
    preheader: 'Use this secure button to reset your AuraPrep password.',
    title: 'Reset Your Password',
    subtitle: `Hello ${name || 'there'}, we received a request to reset your password.`,
    mainContentHtml: `
      <p>We received a request to reset the password for your account associated with <strong>${toEmail}</strong>.</p>
      <p>Click the button below to choose your new password:</p>
    `,
    actionButton: {
      label: 'Reset Password',
      url: resetUrl,
    },
    securityNote: 'This link will expire in 1 hour. If you did not request a password reset, you can safely disregard this email.',
  });

  return sendEmail({
    to: toEmail,
    subject: 'Reset Your AuraPrep Password',
    html,
  });
}

/**
 * Send Password Changed Confirmation
 */
export async function sendPasswordChangedEmail(toEmail: string, name?: string) {
  const loginUrl = 'https://auraprep.us.ci/login';

  const html = generateEmailHtml({
    preheader: 'Your AuraPrep password has been updated.',
    title: 'Password Updated',
    subtitle: `Hello ${name || 'there'}, your account password was successfully updated.`,
    mainContentHtml: `
      <p>This email confirms that the password for your AuraPrep account (<strong>${toEmail}</strong>) was successfully changed.</p>
      <p>You can now log in using your new credentials.</p>
    `,
    actionButton: {
      label: 'Log In to AuraPrep',
      url: loginUrl,
    },
    securityNote: 'If you did not make this change, please contact us immediately at services@auraprep.us.ci.',
  });

  return sendEmail({
    to: toEmail,
    subject: 'Your AuraPrep Password Has Been Changed',
    html,
  });
}

/**
 * Send Free 330+ GRE Diagnostic & Starter Kit (Landing Page Lead)
 */
export async function sendLeadKitEmail(toEmail: string) {
  const registerUrl = 'https://auraprep.us.ci/login?signup=true';

  const html = generateEmailHtml({
    preheader: 'Your Free 330+ GRE Diagnostic Kit & ETS Trap Blueprint has arrived.',
    title: 'Your 330+ GRE Diagnostic Kit is Here',
    subtitle: 'The cognitive breakdown of ETS quantitative & verbal traps.',
    mainContentHtml: `
      <p>Welcome to <strong>AuraPrep</strong>!</p>
      <p>Here is your high-yield GRE preparation starter kit:</p>
      
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:18px; margin:20px 0;">
        <div style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:8px;">📘 What is inside your Starter Kit:</div>
        <div style="font-size:13px; color:#475569; line-height:1.6;">
          1. <strong>The 7 Hardest ETS Quantitative Traps:</strong> Prime factorization shortcuts, hidden inequality signs, and geometric assumptions.<br><br>
          2. <strong>Text Completion & Sentence Equivalence Blueprint:</strong> Decoding double blanks using pivot punctuation and root valence.<br><br>
          3. <strong>Top 100 GRE Words with Multi-Language Etymology:</strong> Master words in English, Hindi, Spanish, French, German, or Japanese.
        </div>
      </div>

      <p>To start your adaptive practice sessions and track your predictive score, activate your account below:</p>
    `,
    actionButton: {
      label: 'Create Free Account & Start Practice',
      url: registerUrl,
    },
  });

  return sendEmail({
    to: toEmail,
    subject: '🎁 Your Free AuraPrep 330+ GRE Diagnostic Kit & Trap Blueprint',
    html,
  });
}

export interface PaymentSlipDetails {
  toEmail: string;
  name?: string;
  invoiceNumber: string;
  paymentId: string;
  orderId?: string;
  amount: number;
  planType: string;
  language?: string;
  paymentDate?: string;
  expiryDate?: string;
}

/**
 * Send Payment Confirmation with Generated Official Payment Slip / Tax Invoice
 */
export async function sendPaymentSlipEmail({
  toEmail,
  name,
  invoiceNumber,
  paymentId,
  orderId,
  amount,
  planType,
  language,
  paymentDate,
  expiryDate,
}: PaymentSlipDetails) {
  const frontendUrl = 'https://auraprep.us.ci';
  const cleanName = name || 'Scholar';
  const rawLang = (language || 'english').toLowerCase();
  const langName = rawLang.charAt(0).toUpperCase() + rawLang.slice(1);
  const nowStr = paymentDate || new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const isMonthly = planType === 'vocab_monthly';
  const isYearly = planType === 'vocab_yearly';
  const isPractice = planType === 'practice_pass';

  let itemTitle = `AuraPrep VocabHub: ${langName} Language Pack`;
  let itemSubtitle = isYearly
    ? `Full 1-Year Access to Modules 1 through 10 (1,200 High-Frequency GRE Words)`
    : isMonthly
    ? `30-Day Access to Modules 1 through 5 (Foundation & Advanced High-Yield Words)`
    : `VocabHub Access`;
  let planDuration = isYearly ? '1 Year (365 Days)' : isMonthly ? '30 Days' : '1 Year';
  let ctaUrl = `${frontendUrl}/vocab?lang=${rawLang}`;
  let ctaLabel = `Start Learning ${langName} in VocabHub`;

  if (isPractice) {
    itemTitle = 'AuraPrep Practice Area Full Pass';
    itemSubtitle = 'Unrestricted access to 1,500+ Discrete Quant, Text Completion & Reading Comprehension questions with cognitive telemetry.';
    planDuration = 'Lifetime Access';
    ctaUrl = `${frontendUrl}/practice`;
    ctaLabel = 'Access Adaptive Practice Area';
  }

  const validUntilStr = expiryDate || (isYearly ? '1 Year from purchase' : isMonthly ? '30 Days from purchase' : 'Permanent');

  const mainContentHtml = `
    <p>Dear <strong>${cleanName}</strong>,</p>
    <p>Thank you for choosing AuraPrep. Your payment has been confirmed. Below is your official tax invoice and payment slip:</p>

    <!-- OFFICIAL PAYMENT SLIP CARD (LIGHT FORMAT) -->
    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:22px; margin:22px 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <!-- Slip Header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:14px;">
        <tr>
          <td align="left" valign="top">
            <div style="font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; font-weight:700;">Official Tax Invoice & Payment Slip</div>
            <div style="font-size:17px; font-weight:700; color:#0f172a; margin-top:3px;">${invoiceNumber}</div>
          </td>
          <td align="right" valign="top">
            <span style="display:inline-block; padding:4px 10px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; color:#059669; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">
              ✓ PAID
            </span>
          </td>
        </tr>
      </table>

      <!-- Customer & Transaction Information -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px; font-size:13px;">
        <tr>
          <td width="55%" align="left" valign="top" style="padding-right:12px;">
            <div style="font-size:10px; text-transform:uppercase; color:#64748b; font-weight:700; letter-spacing:0.06em; margin-bottom:3px;">Billed To:</div>
            <div style="color:#0f172a; font-weight:600; font-size:13px;">${cleanName}</div>
            <div style="color:#64748b; font-size:12px;">${toEmail}</div>
          </td>
          <td width="45%" align="right" valign="top" style="padding-left:12px;">
            <div style="font-size:10px; text-transform:uppercase; color:#64748b; font-weight:700; letter-spacing:0.06em; margin-bottom:3px;">Transaction:</div>
            <div style="color:#334155; font-size:12px;"><strong style="color:#0f172a;">Ref ID:</strong> <code style="color:#059669; font-weight:600; font-size:11px;">${paymentId}</code></div>
            ${orderId ? `<div style="color:#64748b; font-size:11px;"><strong>Order ID:</strong> ${orderId}</div>` : ''}
            <div style="color:#64748b; font-size:11px;"><strong>Date:</strong> ${nowStr}</div>
          </td>
        </tr>
      </table>

      <!-- Itemized Table -->
      <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:16px;">
        <thead>
          <tr style="border-bottom:1px solid #e2e8f0; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:0.06em;">
            <th align="left" style="padding:10px 12px;">Item Description</th>
            <th align="center" style="padding:10px 8px;">Validity</th>
            <th align="right" style="padding:10px 12px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style="color:#334155; font-size:13px; border-bottom:1px solid #f1f5f9;">
            <td style="padding:12px;">
              <div style="font-weight:600; color:#0f172a; font-size:13px;">${itemTitle}</div>
              <div style="font-size:11px; color:#64748b; margin-top:2px;">${itemSubtitle}</div>
            </td>
            <td align="center" style="padding:12px 8px; color:#059669; font-weight:600; font-size:11px; white-space:nowrap;">
              ${validUntilStr}
            </td>
            <td align="right" style="padding:12px; font-weight:700; font-size:14px; color:#0f172a; white-space:nowrap;">
              ₹${amount.toLocaleString('en-IN')}
            </td>
          </tr>
          <!-- Calculations -->
          <tr style="color:#64748b; font-size:12px;">
            <td colspan="2" align="right" style="padding:6px 12px 2px;">Subtotal:</td>
            <td align="right" style="padding:6px 12px 2px; color:#0f172a;">₹${amount.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="color:#64748b; font-size:12px;">
            <td colspan="2" align="right" style="padding:2px 12px;">Taxes (Included):</td>
            <td align="right" style="padding:2px 12px; color:#059669;">₹0.00</td>
          </tr>
          <tr style="color:#0f172a; font-size:14px; font-weight:700; border-top:1px solid #e2e8f0;">
            <td colspan="2" align="right" style="padding:10px 12px;">Total Paid:</td>
            <td align="right" style="padding:10px 12px; color:#059669; font-size:15px;">₹${amount.toLocaleString('en-IN')}</td>
          </tr>
        </tbody>
      </table>

      <!-- Access Status Banner -->
      <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:10px 14px; border-radius:6px; font-size:12px; color:#065f46; line-height:1.5;">
        ⚡ <strong>Immediate Activation:</strong> Your access is unlocked on your account. You can begin practicing immediately.
      </div>
    </div>
  `;

  const html = generateEmailHtml({
    preheader: `Payment Receipt: ${itemTitle} (Slip #${invoiceNumber})`,
    title: 'Payment Confirmed',
    subtitle: `Thank you for your order, ${cleanName}! Here is your official payment slip.`,
    mainContentHtml,
    actionButton: {
      label: ctaLabel,
      url: ctaUrl,
    },
    securityNote: 'Please keep this payment slip for your records. Billed by AuraPrep Learning Systems Inc.',
  });

  return sendEmail({
    to: toEmail,
    subject: `💳 Payment Receipt - ${itemTitle} (${invoiceNumber})`,
    html,
  });
}


