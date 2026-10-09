/* Aplica as migrações da pasta drizzle/ no banco de DATABASE_URL. Uso: npm run db:migrate */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL antes de rodar as migrações.');
  const sql = postgres(url, { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();
  console.log('Migrações aplicadas.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
