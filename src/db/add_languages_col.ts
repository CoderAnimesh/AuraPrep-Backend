import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS unlocked_languages TEXT DEFAULT '{}';
  `;
  console.log('ALTER TABLE SUCCESS!');
  const cols = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
  `;
  console.log('Columns in users:', cols.map(c => c.column_name));
  await sql.end();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
