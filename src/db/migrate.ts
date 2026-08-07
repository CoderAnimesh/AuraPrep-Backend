import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './client.js';

console.log('Running migrations...');
try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete!');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
