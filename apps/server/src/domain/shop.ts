import type { PlantSummary, PurchaseResponse, ShopItem, ShopResponse } from '@haruleaf/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { coinTransactions, plants, userPlants, users } from '../db/schema';
import { AppError } from '../lib/errors';

const FOR_SALE = ['LIMITED', 'SPECIAL'] as const;

export async function listShop(db: Db, userId: string): Promise<ShopResponse> {
  const [account] = await db.select({ coinBalance: users.coinBalance }).from(users).where(eq(users.id, userId)).limit(1);
  const rows = await db
    .select({
      id: plants.id,
      name: plants.name,
      description: plants.description,
      kind: plants.kind,
      catalogClass: plants.catalogClass,
      coinPrice: plants.coinPrice,
      ownerId: userPlants.userId,
    })
    .from(plants)
    .leftJoin(userPlants, and(eq(userPlants.plantId, plants.id), eq(userPlants.userId, userId)))
    .where(and(eq(plants.isActive, true), inArray(plants.catalogClass, [...FOR_SALE])))
    .orderBy(asc(plants.sortOrder), asc(plants.id));
  const items: ShopItem[] = rows.map(({ ownerId, ...plant }) => ({
    ...plant,
    kind: plant.kind as ShopItem['kind'],
    catalogClass: plant.catalogClass as ShopItem['catalogClass'],
    coinPrice: plant.coinPrice ?? 0,
    owned: ownerId !== null,
  }));
  return { coinBalance: account?.coinBalance ?? 0, items };
}

/** 사용자 행을 잠근 뒤 판매 대상·미보유·잔액을 확인하고, 원장·잔액·보유를 한 트랜잭션에서 바꾼다. */
export async function purchase(db: Db, userId: string, plantId: string): Promise<PurchaseResponse> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ coinBalance: users.coinBalance })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!account) throw new AppError('UNAUTHORIZED', '다시 로그인해주세요.', 401);
    const [plant] = await tx
      .select({ id: plants.id, name: plants.name, kind: plants.kind, catalogClass: plants.catalogClass, coinPrice: plants.coinPrice })
      .from(plants)
      .where(and(eq(plants.id, plantId), eq(plants.isActive, true)))
      .limit(1);
    if (!plant) throw new AppError('PLANT_NOT_FOUND', '식물을 찾을 수 없어요.', 404);
    if (!FOR_SALE.includes(plant.catalogClass as (typeof FOR_SALE)[number]) || plant.coinPrice === null) {
      throw new AppError('NOT_FOR_SALE', '상점에서 파는 식물이 아니에요.', 400);
    }
    const [owned] = await tx
      .select({ plantId: userPlants.plantId })
      .from(userPlants)
      .where(and(eq(userPlants.userId, userId), eq(userPlants.plantId, plantId)))
      .limit(1);
    if (owned) throw new AppError('ALREADY_OWNED', '이미 가진 식물이에요.', 409);
    if (account.coinBalance < plant.coinPrice) throw new AppError('INSUFFICIENT_COINS', '코인이 부족해요.', 409);

    await tx.insert(coinTransactions).values({ userId, type: 'PURCHASE', amount: -plant.coinPrice, referenceKey: plant.id });
    const [updated] = await tx
      .update(users)
      .set({ coinBalance: sql`${users.coinBalance} - ${plant.coinPrice}` })
      .where(eq(users.id, userId))
      .returning({ coinBalance: users.coinBalance });
    await tx.insert(userPlants).values({ userId, plantId: plant.id, unlockSource: 'SHOP' });
    const summary: PlantSummary = {
      id: plant.id,
      name: plant.name,
      kind: plant.kind as PlantSummary['kind'],
      catalogClass: plant.catalogClass as PlantSummary['catalogClass'],
    };
    return { coinBalance: updated!.coinBalance, plant: summary };
  });
}
