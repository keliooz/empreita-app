import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

/** Tipo comum ao Postgres de produção e ao PGlite usado em testes e no desenvolvimento. */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __empreitaDb?: Promise<DB> };

/**
 * Uma conexão por processo (no `next dev` o módulo recarrega, por isso o cache global).
 * Sem DATABASE_URL e fora de produção, usa um Postgres embutido (PGlite) salvo na pasta .pglite,
 * para dar para rodar o projeto sem instalar nada.
 */
export function getDb(): Promise<DB> {
  g.__empreitaDb ??= criar().catch((err) => {
    g.__empreitaDb = undefined;
    throw err;
  });
  return g.__empreitaDb;
}

async function criar(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = postgres(url, { max: 5, prepare: false });
    return drizzle(sql, { schema }) as unknown as DB;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL não configurada');

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const db = drizzlePglite(new PGlite('./.pglite'), { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Usando banco local em .pglite (defina DATABASE_URL para usar o Postgres).');
  return db as unknown as DB;
}

export { schema };
