import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db/client.js';
import { users, coupons, payments } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();
export const SUPERUSER_EMAIL = 'animeshpathak78@gmail.com';

interface AdminRequest extends AuthRequest {
  user?: any;
}

/**
 * Superuser Authorization Guard:
 * Strictly blocks every user except animeshpathak78@gmail.com
 */
export async function requireSuperuser(req: AdminRequest, res: any, next: any) {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required. Please log in as the superuser.' });
    return;
  }

  try {
    const userList = await db.select().from(users).where(eq(users.id, userId));
    const currentUser = userList[0];

    if (!currentUser || currentUser.email.toLowerCase() !== SUPERUSER_EMAIL.toLowerCase()) {
      res.status(403).json({
        message: `Access Denied: Only the superuser (${SUPERUSER_EMAIL}) is authorized to access administrative controls. Your email (${currentUser?.email || 'unknown'}) is blocked.`,
      });
      return;
    }

    req.user = currentUser;
    next();
  } catch (err) {
    console.error('[Admin] Superuser guard error:', err);
    res.status(500).json({ message: 'Internal authorization error.' });
  }
}

/**
 * Generate Trendy, Catchy Coupon Codes based on description & discount
 */
export function generateTrendyCouponNames(description: string, discountPercent: number): { suggested: string; alternatives: string[] } {
  const cleanDesc = (description || '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');
  const words = cleanDesc.split(/\s+/).filter((w) => w.length >= 3 && !['THE', 'FOR', 'AND', 'WITH', 'OFF', 'PLAN', 'DISCOUNT'].includes(w));

  const pct = Math.round(Number(discountPercent)) || 20;

  const keywordMap: Record<string, string[]> = {
    QUANT: ['QUANT170', `QUANTSPRINT${pct}`, `QUANTPRO${pct}`],
    VERBAL: ['VERBAL165', `VERBALBOOST${pct}`, `CRACKVERBAL${pct}`],
    VOCAB: [`VOCABMASTER${pct}`, `AURAWORDS${pct}`, `LEXICON${pct}`],
    SUMMIT: [`SUMMIT${pct}`, `SUMMIT330`, `SUMMITPASS${pct}`],
    BLACK: [`BLACKFRIDAY${pct}`, `BF${pct}DEAL`, `SUPERFRIDAY`],
    FRIDAY: [`BLACKFRIDAY${pct}`, `FRIDAYSPRINT${pct}`],
    DIWALI: [`DIWALI${pct}`, `FESTIVE${pct}`, `SHINE330`],
    NEW: [`NEWYEAR${pct}`, `RELOAD${pct}`, `FRESH330`],
    BREAKTHROUGH: [`BREAKTHROUGH${pct}`, `GRE330`, `TOPPERCENTILE`],
    SCORE: [`SCOREBOOST${pct}`, `TARGET335`, `SCOREMAX`],
    IVY: [`IVYBOUND${pct}`, `STANFORD330`, `HARVARDQUANT`],
    PRACTICE: [`PRACTICEMAX${pct}`, `DRILLZONE${pct}`, `UNLIMITED${pct}`],
  };

  const pool: string[] = [];

  // Match domain keywords
  for (const [kw, options] of Object.entries(keywordMap)) {
    if (words.some((w) => w.includes(kw))) {
      pool.push(...options);
    }
  }

  // Generate dynamic keywords from description words
  if (words.length > 0) {
    const primary = words[0].slice(0, 8);
    const secondary = words[1] ? words[1].slice(0, 6) : 'AURA';
    pool.push(`${primary}${pct}`);
    pool.push(`AURA${primary}`);
    pool.push(`${secondary}${primary}${pct}`);
  }

  // General fallbacks
  pool.push(`AURA${pct}`);
  pool.push(`GREBREAKTHROUGH${pct}`);
  pool.push(`TARGET330`);
  pool.push(`SCHOLAR${pct}`);
  pool.push(`TOPPER${pct}`);

  // Deduplicate and filter length
  const unique = Array.from(new Set(pool.map((c) => c.replace(/[^A-Z0-9]/g, '')))).filter((c) => c.length >= 4 && c.length <= 16);

  const suggested = unique[0] || `AURA${pct}`;
  const alternatives = unique.slice(1, 6);

  return { suggested, alternatives };
}

// 1. Verify Superuser Access
router.get('/check-access', authenticateToken, requireSuperuser, (req: AdminRequest, res) => {
  res.json({
    authorized: true,
    email: req.user?.email || SUPERUSER_EMAIL,
    name: req.user?.name || 'Administrator',
    timestamp: new Date().toISOString(),
  });
});

// 2. Generate Trendy Coupon Name dynamically
router.post('/generate-coupon-name', authenticateToken, requireSuperuser, (req: AdminRequest, res) => {
  const { description, discountPercent } = req.body;
  const result = generateTrendyCouponNames(description || '', Number(discountPercent) || 20);
  res.json(result);
});

// 3. Create a New Coupon
router.post('/coupons', authenticateToken, requireSuperuser, async (req: AdminRequest, res) => {
  const { code, description, discountPercent, startDate, endDate, maxUses } = req.body;

  if (!code || !code.trim()) {
    res.status(400).json({ message: 'Coupon code is required.' });
    return;
  }
  if (!description || !description.trim()) {
    res.status(400).json({ message: 'Description is required.' });
    return;
  }

  const pct = parseInt(discountPercent, 10);
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    res.status(400).json({ message: 'Discount percentage must be between 1% and 100%.' });
    return;
  }

  if (!startDate || !endDate) {
    res.status(400).json({ message: 'Both start date and end date are required.' });
    return;
  }

  const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

  try {
    // Check if code already exists
    const existing = await db.select().from(coupons).where(eq(coupons.code, cleanCode));
    if (existing.length > 0) {
      res.status(400).json({ message: `Coupon code "${cleanCode}" already exists. Please choose a different code name.` });
      return;
    }

    const couponId = `cpn_${crypto.randomUUID()}`;
    await db.insert(coupons).values({
      id: couponId,
      code: cleanCode,
      description: description.trim(),
      discountPercent: pct,
      startDate: startDate.trim(),
      endDate: endDate.trim(),
      maxUses: parseInt(maxUses, 10) || 0,
      usedCount: 0,
      isActive: 1,
      createdBy: SUPERUSER_EMAIL,
      createdAt: new Date().toISOString(),
    });

    const createdList = await db.select().from(coupons).where(eq(coupons.id, couponId));
    res.status(201).json({
      message: `Coupon "${cleanCode}" (${pct}% discount) created successfully!`,
      coupon: createdList[0],
    });
  } catch (err: any) {
    console.error('[Admin] Create coupon error:', err);
    res.status(500).json({ message: 'Failed to create coupon.' });
  }
});

// 4. List All Coupons with Stats
router.get('/coupons', authenticateToken, requireSuperuser, async (_req: AdminRequest, res) => {
  try {
    const list = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    res.json({ coupons: list });
  } catch (err: any) {
    console.error('[Admin] List coupons error:', err);
    res.status(500).json({ message: 'Failed to fetch coupons.' });
  }
});

// 5. Toggle Coupon Active Status
router.patch('/coupons/:id/toggle', authenticateToken, requireSuperuser, async (req: AdminRequest, res) => {
  const id = String(req.params.id);
  try {
    const list = await db.select().from(coupons).where(eq(coupons.id, id));
    const coupon = list[0];
    if (!coupon) {
      res.status(404).json({ message: 'Coupon not found.' });
      return;
    }

    const newStatus = coupon.isActive === 1 ? 0 : 1;
    await db.update(coupons).set({ isActive: newStatus }).where(eq(coupons.id, id));

    res.json({
      message: `Coupon "${coupon.code}" has been ${newStatus === 1 ? 'activated' : 'disabled'}.`,
      isActive: newStatus,
    });
  } catch (err: any) {
    console.error('[Admin] Toggle coupon error:', err);
    res.status(500).json({ message: 'Failed to toggle coupon status.' });
  }
});

// 6. Delete a Coupon
router.delete('/coupons/:id', authenticateToken, requireSuperuser, async (req: AdminRequest, res) => {
  const id = String(req.params.id);
  try {
    const list = await db.select().from(coupons).where(eq(coupons.id, id));
    const coupon = list[0];
    if (!coupon) {
      res.status(404).json({ message: 'Coupon not found.' });
      return;
    }

    await db.delete(coupons).where(eq(coupons.id, id));
    res.json({ message: `Coupon "${coupon.code}" has been deleted successfully.` });
  } catch (err: any) {
    console.error('[Admin] Delete coupon error:', err);
    res.status(500).json({ message: 'Failed to delete coupon.' });
  }
});

// 7. Overall Analytics & Coupon Performance
router.get('/analytics', authenticateToken, requireSuperuser, async (_req: AdminRequest, res) => {
  try {
    const allCoupons = await db.select().from(coupons);
    const allPayments = await db.select().from(payments);

    const discountedPayments = allPayments.filter((p) => p.couponCode && p.couponCode.trim() !== '');
    const totalDiscountAmount = discountedPayments.reduce((acc, p) => acc + (p.discountAmount || 0), 0);
    const totalRevenueWithCoupons = discountedPayments.reduce((acc, p) => acc + p.amount, 0);

    res.json({
      totalCoupons: allCoupons.length,
      activeCoupons: allCoupons.filter((c) => c.isActive === 1).length,
      totalRedemptions: allCoupons.reduce((acc, c) => acc + c.usedCount, 0),
      totalDiscountGrantedINR: totalDiscountAmount,
      totalRevenueFromCouponsINR: totalRevenueWithCoupons,
      discountedOrdersCount: discountedPayments.length,
      recentDiscountedOrders: discountedPayments.slice(-10).reverse(),
    });
  } catch (err: any) {
    console.error('[Admin] Analytics error:', err);
    res.status(500).json({ message: 'Failed to fetch analytics.' });
  }
});

export default router;
