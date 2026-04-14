import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:./data/ai-radar.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Auto-migrate: add columns that may be missing from older schema
const _migrated = Promise.allSettled([
  client.execute('ALTER TABLE projects ADD COLUMN repo_created_at text'),
  client.execute('ALTER TABLE projects ADD COLUMN repo_updated_at text'),
  client.execute('ALTER TABLE projects ADD COLUMN previous_stars integer'),
  client.execute('ALTER TABLE projects ADD COLUMN previous_stars_at text'),
]);

export const db = drizzle(client, { schema });
export { schema };
