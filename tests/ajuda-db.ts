import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DB } from '@/db/client';
import * as schema from '@/db/schema';

/** Banco Postgres em memória (PGlite) com as mesmas migrações de produção. */
export async function bancoDeTeste(): Promise<DB> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db as unknown as DB;
}
