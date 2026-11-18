import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const sql = postgres(connectionString, {
  onnotice: () => {},
});

async function run() {
  console.log('Connecting to Neon DB...');
  const existingCols = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
  `;
  console.log('Existing columns in users:', existingCols.map(c => c.column_name));

  console.log('Ensuring totp_secret and totp_enabled columns exist...');
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
  `;
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled INTEGER DEFAULT 0 NOT NULL;
  `;
  console.log('Successfully altered table users!');

  const updatedCols = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
  `;
  console.log('Updated columns in users:', updatedCols.map(c => c.column_name));

  await sql.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Error running migration:', err);
  process.exit(1);
});

