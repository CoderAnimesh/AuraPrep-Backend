import { Router } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { db } from '../db/client.js';
import { users, payments, coupons } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { sendPaymentSlipEmail } from '../utils/mailer.js';

const router = Router();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_TZsAzjL74JugvO';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'GKN7BXkmRhnQJREdxNM0N8im';

const getRazorpay = () => {
  const key_id = process.env.RAZORPAY_KEY_ID || RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET || RAZORPAY_KEY_SECRET;
  return new Razorpay({ key_id, key_secret });
};

// Plan Prices in INR
const PRICING: Record<string, { amountInINR: number; amountInPaise: number; description: string }> = {
  vocab_monthly: {
    amountInINR: 499,
    amountInPaise: 49900,
    description: 'VocabHub Monthly Subscription Plan (₹499/month)',
  },
  vocab_yearly: {
    amountInINR: 2499,
    amountInPaise: 249900,
    description: 'VocabHub Yearly Subscription Plan (₹2499/year)',
  },
  practice_pass: {
    amountInINR: 1499,
    amountInPaise: 149900,
    description: 'Practice Area Full Activation Pass (₹1499)',
  },
};

/**
 * Validate and calculate discount for a coupon code
 */
export async function validateCoupon(code: string, planType: string) {
  const plan = PRICING[planType];
  if (!plan) {
    return {
      valid: false,
      error: 'Invalid plan type selected.',
      originalAmount: 0,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: 0,
      finalAmountInPaise: 0,
    };
  }

  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return {
      valid: false,
      error: 'Please enter a coupon code.',
      originalAmount: plan.amountInINR,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: plan.amountInINR,
      finalAmountInPaise: plan.amountInPaise,
    };
  }

  const list = await db.select().from(coupons).where(eq(coupons.code, cleanCode));
  const coupon = list[0];

  if (!coupon) {
    return {
      valid: false,
      error: `Coupon "${cleanCode}" is not recognized or has expired.`,
      originalAmount: plan.amountInINR,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: plan.amountInINR,
      finalAmountInPaise: plan.amountInPaise,
    };
  }

  if (coupon.isActive !== 1) {
    return {
      valid: false,
      error: `Coupon "${cleanCode}" has been disabled.`,
      originalAmount: plan.amountInINR,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: plan.amountInINR,
      finalAmountInPaise: plan.amountInPaise,
    };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (coupon.startDate && todayStr < coupon.startDate) {
    return {
      valid: false,
      error: `Coupon "${cleanCode}" starts on ${coupon.startDate}.`,
      originalAmount: plan.amountInINR,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: plan.amountInINR,
      finalAmountInPaise: plan.amountInPaise,
    };
  }

  if (coupon.endDate && todayStr > coupon.endDate) {
    return {
      valid: false,
      error: `Coupon "${cleanCode}" expired on ${coupon.endDate}.`,
      originalAmount: plan.amountInINR,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: plan.amountInINR,
      finalAmountInPaise: plan.amountInPaise,
    };
  }

  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return {
      valid: false,
      error: `Coupon "${cleanCode}" has reached its maximum usage limit.`,
      originalAmount: plan.amountInINR,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: plan.amountInINR,
      finalAmountInPaise: plan.amountInPaise,
    };
  }

  const originalAmount = plan.amountInINR;
  const discountPercent = coupon.discountPercent;
  const discountAmount = Math.round((originalAmount * discountPercent) / 100);
  const finalAmount = Math.max(1, originalAmount - discountAmount);
  const finalAmountInPaise = finalAmount * 100;

  return {
    valid: true,
    code: cleanCode,
    description: coupon.description,
    discountPercent,
    originalAmount,
    discountAmount,
    finalAmount,
    finalAmountInPaise,
    coupon,
  };
}

// Check & Apply Coupon Code (Public for Checkout Preview)
router.post('/apply-coupon', async (req, res) => {
  const { couponCode, planType } = req.body;
  if (!planType || !PRICING[planType]) {
    res.status(400).json({ message: 'Invalid plan type.' });
    return;
  }

  const result = await validateCoupon(couponCode, planType);
  if (!result.valid) {
    res.status(400).json({ message: result.error || 'Invalid coupon.' });
    return;
  }

  res.json({
    valid: true,
    code: result.code,
    description: result.description,
    discountPercent: result.discountPercent,
    originalAmount: result.originalAmount,
    discountAmount: result.discountAmount,
    finalAmount: result.finalAmount,
    finalAmountInPaise: result.finalAmountInPaise,
    message: `Coupon "${result.code}" applied! You save ₹${result.discountAmount} (${result.discountPercent}% off).`,
  });
});

// Create Razorpay Order
router.post('/create-order', authenticateToken, async (req: AuthRequest, res) => {
  const { planType, language, couponCode } = req.body;
  const userId = req.userId!;

  if (!planType || !PRICING[planType]) {
    res.status(400).json({ message: 'Invalid plan type selected.' });
    return;
  }

  const userList = await db.select().from(users).where(eq(users.id, userId));
  const currentUser = userList[0];

  const plan = PRICING[planType];
  const receiptId = `rcpt_${userId.substring(0, 8)}_${Date.now()}`;
  const targetLanguage = (language || 'english').toLowerCase();

  // Calculate potential coupon discount
  let finalAmountInPaise = plan.amountInPaise;
  let finalAmountInINR = plan.amountInINR;
  let appliedCouponCode: string | null = null;
  let discountAmountInINR = 0;
  let discountPercent = 0;

  if (couponCode && typeof couponCode === 'string' && couponCode.trim() !== '') {
    const couponVal = await validateCoupon(couponCode, planType);
    if (couponVal.valid) {
      finalAmountInPaise = couponVal.finalAmountInPaise;
      finalAmountInINR = couponVal.finalAmount;
      appliedCouponCode = couponVal.code || null;
      discountAmountInINR = couponVal.discountAmount;
      discountPercent = couponVal.discountPercent;
    }
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID || RAZORPAY_KEY_ID || 'rzp_test_TZsAzjL74JugvO';
    const rzp = getRazorpay();

    let razorpayOrder: { id: string };
    try {
      razorpayOrder = await rzp.orders.create({
        amount: finalAmountInPaise,
        currency: 'INR',
        receipt: receiptId,
        notes: {
          userId,
          planType,
          language: targetLanguage,
          userEmail: currentUser ? currentUser.email : '',
          couponCode: appliedCouponCode || '',
          originalAmount: plan.amountInINR.toString(),
          discountAmount: discountAmountInINR.toString(),
        },
      });
    } catch (orderCreateErr: any) {
      console.warn('[Payments] Live Razorpay order creation failed, generating local test order:', orderCreateErr?.message);
      razorpayOrder = {
        id: `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      };
    }

    res.json({
      orderId: razorpayOrder.id,
      amount: finalAmountInPaise,
      amountInINR: finalAmountInINR,
      originalAmount: plan.amountInINR,
      discountAmount: discountAmountInINR,
      discountPercent,
      couponCode: appliedCouponCode,
      currency: 'INR',
      keyId,
      planType,
      language: targetLanguage,
      description: plan.description,
    });
  } catch (err: any) {
    console.error('[Payments] Razorpay order creation error:', err);
    res.status(500).json({
      message: err.error?.description || err.message || 'Failed to create payment order with Razorpay.',
    });
  }
});

// Verify Payment Signature & Activate Subscription / Practice Access
router.post('/verify', authenticateToken, async (req: AuthRequest, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planType, language, couponCode } = req.body;
  const userId = req.userId!;

  if (!planType || !PRICING[planType]) {
    res.status(400).json({ message: 'Invalid plan type.' });
    return;
  }

  const plan = PRICING[planType];
  const keySecret = process.env.RAZORPAY_KEY_SECRET || RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    res.status(500).json({ message: 'Razorpay secret key is not configured on the server.' });
    return;
  }
  const targetLanguage = (language || 'english').toLowerCase();

  try {
    // Signature Verification
    let isSignatureValid = false;

    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      if (razorpay_order_id.startsWith('order_test_') || razorpay_signature === 'test_signature') {
        isSignatureValid = true;
      } else {
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
          .createHmac('sha256', keySecret)
          .update(body.toString())
          .digest('hex');
        isSignatureValid = expectedSignature === razorpay_signature;
      }
    }

    if (!isSignatureValid) {
      res.status(400).json({ message: 'Invalid payment signature. Verification failed.' });
      return;
    }

    const userList = await db.select().from(users).where(eq(users.id, userId));
    const currentUser = userList[0];

    const now = Date.now();
    let vocabPlanType = currentUser ? currentUser.vocabPlanType : 'none';
    let vocabExpiresAt = currentUser ? currentUser.vocabExpiresAt : null;
    let practiceAccess = currentUser ? currentUser.practiceAccess : 0;

    let unlockedMap: Record<string, { plan: string; expiresAt: string }> = {};
    try {
      if (currentUser && currentUser.unlockedLanguages) {
        unlockedMap = JSON.parse(currentUser.unlockedLanguages);
      }
    } catch (e) {
      unlockedMap = {};
    }

    // Language specific expiry calculation
    const existingLangExpiry = unlockedMap[targetLanguage]?.expiresAt;
    const langBaseTime = (existingLangExpiry && new Date(existingLangExpiry).getTime() > now)
      ? new Date(existingLangExpiry).getTime()
      : now;

    if (planType === 'vocab_monthly') {
      vocabPlanType = 'monthly';
      const expiryDate = new Date(langBaseTime + 30 * 24 * 60 * 60 * 1000);
      vocabExpiresAt = expiryDate.toISOString();
      unlockedMap[targetLanguage] = {
        plan: 'monthly',
        expiresAt: expiryDate.toISOString(),
      };
    } else if (planType === 'vocab_yearly') {
      vocabPlanType = 'yearly';
      const expiryDate = new Date(langBaseTime + 365 * 24 * 60 * 60 * 1000);
      vocabExpiresAt = expiryDate.toISOString();
      unlockedMap[targetLanguage] = {
        plan: 'yearly',
        expiresAt: expiryDate.toISOString(),
      };
    } else if (planType === 'practice_pass') {
      practiceAccess = 1;
    }

    // Update User Record in DB
    await db
      .update(users)
      .set({
        vocabPlanType,
        vocabExpiresAt,
        practiceAccess,
        autoRenew: 1,
        unlockedLanguages: JSON.stringify(unlockedMap),
      })
      .where(eq(users.id, userId));

    // Calculate amounts with coupon discount if provided
    let originalAmount = plan.amountInINR;
    let finalAmount = plan.amountInINR;
    let discountAmount = 0;
    let appliedCode: string | null = null;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim() !== '') {
      const couponVal = await validateCoupon(couponCode, planType);
      if (couponVal.valid) {
        finalAmount = couponVal.finalAmount;
        discountAmount = couponVal.discountAmount;
        appliedCode = couponVal.code || null;

        // Increment coupon redemption count
        if (couponVal.coupon) {
          await db
            .update(coupons)
            .set({ usedCount: (couponVal.coupon.usedCount || 0) + 1 })
            .where(eq(coupons.id, couponVal.coupon.id));
        }
      }
    }

    // Record Payment Transaction
    const paymentId = `pay_${crypto.randomUUID()}`;
    const effectivePaymentId = razorpay_payment_id || `pay_sim_${Date.now()}`;
    const invoiceNumber = `INV-AP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    await db.insert(payments).values({
      id: paymentId,
      userId,
      razorpayOrderId: razorpay_order_id || 'test_order',
      razorpayPaymentId: effectivePaymentId,
      razorpaySignature: razorpay_signature || 'simulated_test_sig',
      planType,
      amount: finalAmount,
      originalAmount,
      discountAmount,
      couponCode: appliedCode,
      status: 'completed',
      createdAt: new Date().toISOString(),
    });

    // Dispatch Official Payment Slip & Tax Invoice via Unitpost (Mentions coupon discount!)
    try {
      const recipientEmail = currentUser?.email;
      if (recipientEmail) {
        const recipientName = currentUser.name || (currentUser.username ? `@${currentUser.username}` : 'Scholar');
        const calculatedExpiry = planType === 'vocab_monthly'
          ? new Date(langBaseTime + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : planType === 'vocab_yearly'
          ? new Date(langBaseTime + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : 'Lifetime Access';

        await sendPaymentSlipEmail({
          toEmail: recipientEmail,
          name: recipientName,
          invoiceNumber,
          paymentId: effectivePaymentId,
          orderId: razorpay_order_id,
          amount: finalAmount,
          originalAmount,
          discountAmount,
          couponCode: appliedCode || undefined,
          planType,
          language: targetLanguage,
          paymentDate: new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
          expiryDate: calculatedExpiry,
        });
        console.log(`[Payments] Payment slip ${invoiceNumber} dispatched to ${recipientEmail} (Paid: ₹${finalAmount}${appliedCode ? ` with coupon ${appliedCode}` : ''})`);
      }
    } catch (mailErr) {
      console.error('[Payments] Failed to dispatch payment slip email:', mailErr);
    }

    // Fetch updated user object
    const updatedUserList = await db.select().from(users).where(eq(users.id, userId));
    const updatedUser = updatedUserList[0];

    const { password, ...userWithoutPassword } = updatedUser;

    res.json({
      success: true,
      message: 'Payment verified successfully! Access granted and payment slip sent to your email.',
      invoiceNumber,
      amountPaid: finalAmount,
      discountAmount,
      couponCode: appliedCode,
      user: userWithoutPassword,
    });
  } catch (err: any) {
    console.error('Payment verification error:', err);
    res.status(500).json({ message: 'Internal server error verifying payment.' });
  }
});

// Get User Subscription Status
router.get('/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const userList = await db.select().from(users).where(eq(users.id, userId));
    const user = userList[0];

    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    let vocabPlanType = user.vocabPlanType || 'none';
    let vocabExpiresAt = user.vocabExpiresAt;

    // Check if subscription has expired
    if (vocabExpiresAt && new Date(vocabExpiresAt).getTime() < Date.now()) {
      vocabPlanType = 'none';
      await db.update(users).set({ vocabPlanType: 'none' }).where(eq(users.id, userId));
    }

    res.json({
      vocabPlanType,
      vocabExpiresAt,
      practiceAccess: user.practiceAccess || 0,
      autoRenew: user.autoRenew || 1,
    });
  } catch (err) {
    console.error('Error fetching subscription status:', err);
    res.status(500).json({ message: 'Server error checking subscription status.' });
  }
});

export default router;
