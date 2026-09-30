import { sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config';
import { createDb, type Db } from './client';
import { plants } from './schema';
import { CATALOG } from './seed-data';

/** 카탈로그를 upsert한다. 여러 번 실행해도 결과가 같다. */
export async function seedCatalog(db: Db): Promise<void> {
  await db
    .insert(plants)
    .values(CATALOG)
    .onConflictDoUpdate({
      target: plants.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        kind: sql`excluded.kind`,
        catalogClass: sql`excluded.catalog_class`,
        initialFree: sql`excluded.initial_free`,
        coinPrice: sql`excluded.coin_price`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db, pool } = createDb(loadConfig().databaseUrl);
  try {
    await seedCatalog(db);
    console.log(`식물 카탈로그 ${CATALOG.length}건을 반영했습니다.`);
  } finally {
    await pool.end();
  }
}
