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

export async function initAuthEmailTables() {
  console.log('Ensuring email_verifications and password_resets tables exist...');
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id VARCHAR(256) PRIMARY KEY,
        email VARCHAR(256) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `;
    console.log('Table email_verifications verified/created.');

    await sql`
      CREATE TABLE IF NOT EXISTS password_resets (
        id VARCHAR(256) PRIMARY KEY,
        user_id VARCHAR(256) NOT NULL REFERENCES users(id),
        email VARCHAR(256) NOT NULL,
        token VARCHAR(256) NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT NOT NULL
      );
    `;
    console.log('Table password_resets verified/created.');
  } catch (err) {
    console.error('Error creating auth email tables:', err);
    throw err;
  }
}

async function run() {
  await initAuthEmailTables();
  await sql.end();
  console.log('Database initialization complete!');
  process.exit(0);
}

if (process.argv[1]?.includes('init_email_tables')) {
  run().catch(() => process.exit(1));
}

