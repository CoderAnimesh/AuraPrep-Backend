import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const sql = postgres(connectionString, {
  onnotice: () => {},
});

async function initPaymentsDb() {
  console.log('Initializing payments and subscription database schema...');
  try {
    // Add columns to users table if they do not exist
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS vocab_plan_type VARCHAR(50) DEFAULT 'none' NOT NULL,
      ADD COLUMN IF NOT EXISTS vocab_expires_at TEXT,
      ADD COLUMN IF NOT EXISTS practice_access INTEGER DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS auto_renew INTEGER DEFAULT 1 NOT NULL;
    `;
    console.log('Columns added to users table successfully.');

    // Create payments table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(256) PRIMARY KEY,
        user_id VARCHAR(256) NOT NULL REFERENCES users(id),
        razorpay_order_id VARCHAR(256),
        razorpay_payment_id VARCHAR(256),
        razorpay_signature TEXT,
        plan_type VARCHAR(100) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'completed' NOT NULL,
        created_at TEXT NOT NULL
      );
    `;
    console.log('Payments table ensured successfully.');
  } catch (err) {
    console.error('Error initializing payments DB schema:', err);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

initPaymentsDb();
