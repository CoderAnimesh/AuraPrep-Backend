import nodemailer from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Base Branded HTML Template Generator
 * Produces clean, cross-client responsive email HTML with AuraPrep luxury dark/emerald branding.
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
            `<span style="display:inline-block; width:38px; height:46px; line-height:46px; font-size:24px; font-weight:700; font-family:'Courier New', monospace; background:#18221c; color:#10b981; border:1px solid rgba(16,185,129,0.3); border-radius:8px; margin:0 4px; text-align:center;">${d}</span>`
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
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#090d0b; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; color:#d1d5db;">
  ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#090d0b; padding:30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#121a15; border:1px solid rgba(16,185,129,0.22); border-radius:20px; overflow:hidden; box-shadow:0 20px 45px rgba(0,0,0,0.5);">
          <!-- Top Glow Accent Bar -->
          <tr>
            <td height="4" style="background:linear-gradient(90deg, #059669 0%, #10b981 50%, #34d399 100%);"></td>
          </tr>
          
          <!-- Header Area -->
          <tr>
            <td style="padding:32px 36px 20px; text-align:center;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25); border-radius:999px;">
                      <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#10b981;"></span>
                      <span style="font-size:12px; font-weight:600; color:#34d399; letter-spacing:0.04em; text-transform:uppercase;">
                        ${badgeText || 'AuraPrep Security & Admissions'}
                      </span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:18px;">
                    <h1 style="margin:0; font-size:26px; font-weight:800; color:#f3f4f6; letter-spacing:-0.02em;">
                      ${title}
                    </h1>
                    ${
                      subtitle
                        ? `<p style="margin:8px 0 0; font-size:14px; color:#9ca3af; line-height:1.5;">${subtitle}</p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:10px 36px 30px;">
              <div style="font-size:15px; line-height:1.6; color:#e5e7eb;">
                ${mainContentHtml}
              </div>

              <!-- OTP Code Segment if present -->
              ${
                codeBadge
                  ? `
                <div style="margin:26px 0; padding:20px; background:#0b110e; border:1px dashed rgba(16,185,129,0.3); border-radius:14px; text-align:center;">
                  <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:#9ca3af; letter-spacing:0.08em; margin-bottom:12px;">Your One-Time 6-Digit Code</div>
                  <div style="text-align:center;">
                    ${codeDigitsHtml}
                  </div>
                  <div style="font-size:12px; color:#6b7280; margin-top:12px;">Valid for 15 minutes • Do not share with anyone</div>
                </div>
              `
                  : ''
              }

              <!-- Action Button if present -->
              ${
                actionButton
                  ? `
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0 10px;">
                  <tr>
                    <td align="center">
                      <a href="${actionButton.url}" target="_blank" style="display:inline-block; padding:14px 34px; background:linear-gradient(135deg, #059669 0%, #10b981 100%); color:#ffffff; text-decoration:none; font-size:15px; font-weight:700; border-radius:12px; box-shadow:0 8px 24px rgba(16,185,129,0.35); text-align:center;">
                        ${actionButton.label} &rarr;
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:12px;">
                      <span style="font-size:11px; color:#6b7280; word-break:break-all;">
                        Or copy link: <a href="${actionButton.url}" style="color:#10b981; text-decoration:underline;">${actionButton.url}</a>
                      </span>
                    </td>
                  </tr>
                </table>
              `
                  : ''
              }

              <!-- Security Notice -->
              ${
                securityNote
                  ? `
                <div style="margin-top:24px; padding:12px 16px; background:rgba(239,68,68,0.06); border-left:3px solid #ef4444; border-radius:6px; font-size:12px; color:#9ca3af; line-height:1.45;">
                  <strong style="color:#f87171;">Security Advisory:</strong> ${securityNote}
                </div>
              `
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 36px 26px; background-color:#0d1410; border-top:1px solid rgba(255,255,255,0.06); text-align:center;">
              <p style="margin:0 0 6px; font-size:12px; color:#9ca3af; font-weight:500;">
                AuraPrep • Adaptive Learning & ETS Trap Deconstruction
              </p>
              <p style="margin:0; font-size:11px; color:#6b7280; line-height:1.4;">
                Crafted for ambitious GRE candidates worldwide.<br>
                Educational Testing Service (ETS) and GRE are registered trademarks of their respective owners.
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
  const fromEmail = process.env.UNITPOST_FROM_EMAIL || process.env.SMTP_FROM || 'AuraPrep <noreply@auraprep.com>';

  // 1. Try Unitpost API first if key is present
  if (unitpostApiKey && unitpostApiKey.trim() !== '') {
    try {
      console.log(`[Mailer/Unitpost] Sending email to: ${to} | Subject: "${subject}"`);
      const response = await fetch('https://www.unitpost.com/api/v1/email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${unitpostApiKey.trim()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'AuraPrep-Backend/1.0',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html,
          text: text || subject,
        }),
      });

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as any;
        console.log(`[Mailer/Unitpost] Email successfully sent to ${to}. Message ID:`, data?.id || data?.data?.id || 'ok');
        return { success: true, id: data?.id || data?.data?.id };
      } else {
        const errText = await response.text();
        console.warn(`[Mailer/Unitpost] Failed with status ${response.status}: ${errText}. Attempting fallback...`);
      }
    } catch (unitpostErr) {
      console.warn('[Mailer/Unitpost] Network or API error:', unitpostErr);
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
    subtitle: name ? `Welcome aboard, ${name}! Let's confirm your email.` : "Let's confirm your email address to get started.",
    badgeText: 'Account Verification',
    mainContentHtml: `
      <p>Thank you for choosing <strong>AuraPrep</strong> to power your GRE score breakthrough.</p>
      <p>Please enter the 6-digit confirmation code below to verify your email and activate your account:</p>
    `,
    codeBadge: otpCode,
    securityNote: 'This code expires in 15 minutes. Never share this code with anyone. AuraPrep staff will never ask for your verification code.',
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
  const loginUrl = (process.env.FRONTEND_URL || 'https://auraprep.us.ci').replace(/\/$/, '') + '/login';

  const html = generateEmailHtml({
    preheader: `Welcome to AuraPrep, ${name}! Your account credentials are ready.`,
    title: `Welcome to AuraPrep, ${name}!`,
    subtitle: 'Your pathway to Quant 170 & Verbal 165+ starts today.',
    badgeText: 'Account Created',
    mainContentHtml: `
      <p>Congratulations! Your personal <strong>AuraPrep</strong> account has been successfully initialized.</p>
      
      <div style="background:#0b110e; border:1px solid rgba(16,185,129,0.2); border-radius:12px; padding:18px; margin:20px 0;">
        <div style="font-size:13px; color:#9ca3af; margin-bottom:8px;"><strong>Account Details:</strong></div>
        <div style="font-size:14px; color:#f3f4f6; margin-bottom:4px;">👤 <strong>Full Name:</strong> ${name}</div>
        <div style="font-size:14px; color:#f3f4f6; margin-bottom:4px;">🆔 <strong>Username / Login:</strong> <code style="color:#34d399; font-weight:700;">${username}</code></div>
        <div style="font-size:14px; color:#f3f4f6;">✉️ <strong>Registered Email:</strong> ${toEmail}</div>
      </div>

      <p>Here is what you have unlocked:</p>
      <ul style="padding-left:20px; margin:14px 0; color:#d1d5db; line-height:1.7;">
        <li><strong>ETS Trap Deconstruction:</strong> Eliminate false-equivalence and extreme language traps.</li>
        <li><strong>Vocabulary Hub:</strong> 1,200+ high-frequency GRE words with etymological signposts in 6 global languages.</li>
        <li><strong>Cognitive Error Telemetry:</strong> Track your weaknesses and adaptive section pacing in real time.</li>
      </ul>
    `,
    actionButton: {
      label: 'Access Your Dashboard',
      url: loginUrl,
    },
    securityNote: 'Keep your login credentials secure. Remember to keep Two-Factor Authentication enabled for maximum account protection.',
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
    preheader: 'Use this secure link to reset your AuraPrep password.',
    title: 'Reset Your Password',
    subtitle: `Hello ${name || 'there'}, we received a request to reset your account password.`,
    badgeText: 'Security Notice',
    mainContentHtml: `
      <p>We received a request to change the password associated with your AuraPrep account (<strong>${toEmail}</strong>).</p>
      <p>Click the secure button below to set a new password:</p>
    `,
    actionButton: {
      label: 'Reset My Password',
      url: resetUrl,
    },
    securityNote: 'This reset link will expire in 1 hour. If you did not request a password reset, you can safely disregard this email—your existing password remains secure.',
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
  const loginUrl = (process.env.FRONTEND_URL || 'https://auraprep.us.ci').replace(/\/$/, '') + '/login';

  const html = generateEmailHtml({
    preheader: 'Your AuraPrep password has been updated.',
    title: 'Password Changed Successfully',
    subtitle: `Hello ${name || 'there'}, your account security credentials have been updated.`,
    badgeText: 'Security Alert',
    mainContentHtml: `
      <p>This email confirms that the password for your AuraPrep account (<strong>${toEmail}</strong>) was successfully changed.</p>
      <p>You can now log in using your new credentials.</p>
    `,
    actionButton: {
      label: 'Log In to AuraPrep',
      url: loginUrl,
    },
    securityNote: 'If you did NOT make this change, please contact AuraPrep Support immediately to lock your account.',
  });

  return sendEmail({
    to: toEmail,
    subject: 'Security Alert: AuraPrep Password Changed',
    html,
  });
}

/**
 * Send Free 330+ GRE Diagnostic & Starter Kit (Landing Page Lead)
 */
export async function sendLeadKitEmail(toEmail: string) {
  const registerUrl = (process.env.FRONTEND_URL || 'https://auraprep.us.ci').replace(/\/$/, '') + '/login?signup=true';

  const html = generateEmailHtml({
    preheader: 'Your Free 330+ GRE Diagnostic Kit & ETS Trap Blueprint has arrived.',
    title: 'Your 330+ GRE Diagnostic Kit is Here',
    subtitle: 'The cognitive breakdown of ETS quantitative & verbal traps.',
    badgeText: 'Free Starter Kit',
    mainContentHtml: `
      <p>Welcome to <strong>AuraPrep</strong>!</p>
      <p>Here is your high-yield GRE preparation starter kit:</p>
      
      <div style="background:#0b110e; border:1px solid rgba(16,185,129,0.25); border-radius:12px; padding:18px; margin:20px 0;">
        <div style="font-size:14px; font-weight:700; color:#34d399; margin-bottom:8px;">📘 What is inside your Starter Kit:</div>
        <div style="font-size:13px; color:#d1d5db; line-height:1.6;">
          1. <strong>The 7 Hardest ETS Quantitative Traps:</strong> Prime factorization shortcuts, hidden inequality signs, and geometric assumptions.<br><br>
          2. <strong>Text Completion & Sentence Equivalence Blueprint:</strong> Decoding double blanks using pivot punctuation and root valence.<br><br>
          3. <strong>Top 100 GRE Words with Multi-Language Etymology:</strong> Master words in English, Hindi, Spanish, French, German, or Japanese.
        </div>
      </div>

      <p>To start your free adaptive practice sessions and track your predictive GRE score, activate your account below:</p>
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
  const frontendUrl = (process.env.FRONTEND_URL || 'https://auraprep.us.ci').replace(/\/$/, '');
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
    <p>Thank you for your purchase with AuraPrep. Your payment has been confirmed and verified. Below is your official system-generated payment slip and tax invoice.</p>

    <!-- OFFICIAL PAYMENT SLIP CARD -->
    <div style="background:#090f0c; border:1.5px solid #10b981; border-radius:16px; padding:24px 22px; margin:22px 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow:0 12px 35px rgba(0,0,0,0.5);">
      <!-- Slip Header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:16px;">
        <tr>
          <td align="left" valign="top">
            <div style="font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:#10b981; font-weight:700;">Official Tax Invoice & Payment Slip</div>
            <div style="font-size:18px; font-weight:800; color:#ffffff; margin-top:3px; letter-spacing:0.02em;">${invoiceNumber}</div>
          </td>
          <td align="right" valign="top">
            <span style="display:inline-block; padding:5px 12px; background:rgba(16,185,129,0.15); border:1px solid #10b981; border-radius:999px; color:#34d399; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">
              ✓ PAID
            </span>
          </td>
        </tr>
      </table>

      <!-- Customer & Transaction Information -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px; font-size:13px;">
        <tr>
          <td width="55%" align="left" valign="top" style="padding-right:12px;">
            <div style="font-size:10px; text-transform:uppercase; color:#9ca3af; font-weight:700; letter-spacing:0.06em; margin-bottom:4px;">Billed To:</div>
            <div style="color:#ffffff; font-weight:700; font-size:14px; margin-bottom:2px;">${cleanName}</div>
            <div style="color:#9ca3af; font-size:12px;">${toEmail}</div>
          </td>
          <td width="45%" align="right" valign="top" style="padding-left:12px;">
            <div style="font-size:10px; text-transform:uppercase; color:#9ca3af; font-weight:700; letter-spacing:0.06em; margin-bottom:4px;">Transaction Record:</div>
            <div style="color:#d1d5db; font-size:12px; margin-bottom:2px;"><strong style="color:#ffffff;">Ref ID:</strong> <code style="color:#34d399; font-weight:700; font-size:11px;">${paymentId}</code></div>
            ${orderId ? `<div style="color:#9ca3af; font-size:11px; margin-bottom:2px;"><strong>Order ID:</strong> ${orderId}</div>` : ''}
            <div style="color:#9ca3af; font-size:11px;"><strong>Date:</strong> ${nowStr}</div>
          </td>
        </tr>
      </table>

      <!-- Itemized Table -->
      <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background:#040705; border:1px solid rgba(255,255,255,0.06); border-radius:10px; margin-bottom:18px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.08); color:#9ca3af; font-size:10px; text-transform:uppercase; letter-spacing:0.08em;">
            <th align="left" style="padding:10px 12px;">Item Description</th>
            <th align="center" style="padding:10px 8px;">Validity</th>
            <th align="right" style="padding:10px 12px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style="color:#ffffff; font-size:13px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:12px;">
              <div style="font-weight:700; color:#ffffff; font-size:14px;">${itemTitle}</div>
              <div style="font-size:11px; color:#9ca3af; margin-top:4px; line-height:1.4;">${itemSubtitle}</div>
            </td>
            <td align="center" style="padding:12px 8px; color:#34d399; font-weight:600; font-size:11px; white-space:nowrap;">
              ${validUntilStr}
            </td>
            <td align="right" style="padding:12px; font-weight:700; font-size:15px; color:#ffffff; white-space:nowrap;">
              ₹${amount.toLocaleString('en-IN')}
            </td>
          </tr>
          <!-- Calculations -->
          <tr style="color:#9ca3af; font-size:12px;">
            <td colspan="2" align="right" style="padding:8px 12px 4px;">Subtotal:</td>
            <td align="right" style="padding:8px 12px 4px; color:#ffffff;">₹${amount.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="color:#9ca3af; font-size:12px;">
            <td colspan="2" align="right" style="padding:4px 12px;">GST / Taxes (18% inclusive):</td>
            <td align="right" style="padding:4px 12px; color:#34d399;">₹0.00 (Included)</td>
          </tr>
          <tr style="color:#ffffff; font-size:15px; font-weight:800; border-top:1px solid rgba(255,255,255,0.1);">
            <td colspan="2" align="right" style="padding:12px 12px; color:#f3f4f6;">Total Paid:</td>
            <td align="right" style="padding:12px 12px; color:#10b981; font-size:16px;">₹${amount.toLocaleString('en-IN')}</td>
          </tr>
        </tbody>
      </table>

      <!-- Access Status Banner -->
      <div style="background:rgba(16,185,129,0.08); border-left:3px solid #10b981; padding:12px 16px; border-radius:6px; font-size:12px; color:#d1d5db; line-height:1.5;">
        ⚡ <strong>Immediate Activation:</strong> Your ${langName} vocabulary modules and interactive tools are unlocked and ready on your account. You can begin practicing immediately.
      </div>
    </div>
  `;

  const html = generateEmailHtml({
    preheader: `Payment Receipt: ${itemTitle} (Slip #${invoiceNumber})`,
    title: 'Payment Confirmed & Verified',
    subtitle: `Thank you for your order, ${cleanName}! Here is your official payment slip.`,
    badgeText: 'Payment Slip',
    mainContentHtml,
    actionButton: {
      label: ctaLabel,
      url: ctaUrl,
    },
    securityNote: 'Please keep this payment slip for your personal tax and accounting records. Billed by AuraPrep Learning Systems Inc.',
  });

  return sendEmail({
    to: toEmail,
    subject: `💳 Payment Receipt & Tax Invoice - ${itemTitle} (${invoiceNumber})`,
    html,
  });
}


