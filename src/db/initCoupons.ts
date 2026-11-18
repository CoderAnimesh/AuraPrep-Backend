import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing.');
}

const sql = postgres(connectionString, {
  onnotice: () => {}, // Suppress informational PostgreSQL NOTICE logs in console
});

export async function ensureCouponsTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS coupons (
        id VARCHAR(256) PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        description TEXT NOT NULL,
        discount_percent INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        max_uses INTEGER NOT NULL DEFAULT 0,
        used_count INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_by VARCHAR(256) NOT NULL DEFAULT 'animeshpathak78@gmail.com',
        created_at TEXT NOT NULL
      );
    `;

    await sql`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS original_amount INTEGER;
    `;
    await sql`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0;
    `;
    await sql`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(100);
    `;

    console.log('[Database] Coupons table and payment coupon columns verified successfully.');
  } catch (err: any) {
    console.error('[Database] Failed to ensure coupons table:', err?.message || err);
  }
}

if (process.argv[1]?.endsWith('initCoupons.ts')) {
  ensureCouponsTable().then(() => process.exit(0)).catch(() => process.exit(1));
}

