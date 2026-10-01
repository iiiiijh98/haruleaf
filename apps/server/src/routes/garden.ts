import { monthKeySchema, z, type GardenMonthResponse, type GardenResponse } from '@haruleaf/shared';
import { closePastMonths } from '../domain/closing';
import { getGarden, getGardenMonth } from '../domain/garden';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

const YEAR_MESSAGE = '연도 형식이 올바르지 않아요.';
const yearSchema = z.string({ error: YEAR_MESSAGE }).regex(/^[1-9]\d{3}$/, YEAR_MESSAGE).transform(Number);

export const gardenRoutes: ProtectedPlugin = async (app, { db, clock, pickUnlock }) => {
  app.get('/garden', async (request): Promise<GardenResponse> => {
    const { userId } = authOf(request);
    const { year } = request.query as { year?: string };
    const today = clock.today();
    const target = year === undefined ? Number(today.slice(0, 4)) : yearSchema.parse(year);
    await closePastMonths(db, userId, today, pickUnlock);
    return getGarden(db, userId, target, today);
  });

  app.get<{ Params: { month: string } }>('/garden/:month', async (request): Promise<GardenMonthResponse> => {
    const { userId } = authOf(request);
    const month = monthKeySchema.parse(request.params.month);
    const today = clock.today();
    await closePastMonths(db, userId, today, pickUnlock);
    return getGardenMonth(db, userId, month, today);
  });
};
