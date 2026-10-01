import { selectPlantSchema, unlockAckSchema, type HomeResponse, type OkResponse, type PlantsResponse } from '@haruleaf/shared';
import { closePastMonths } from '../domain/closing';
import { acknowledgeUnlocks, homeFor, listPlants, selectPlant } from '../domain/months';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const homeRoutes: ProtectedPlugin = async (app, { db, clock, pickUnlock, attendanceCoins }) => {
  app.get('/home', async (request): Promise<HomeResponse> => {
    const { userId } = authOf(request);
    const today = clock.today();
    await closePastMonths(db, userId, today, pickUnlock);
    return homeFor(db, userId, today, attendanceCoins);
  });

  app.get('/plants', async (request): Promise<PlantsResponse> => {
    const { userId } = authOf(request);
    await closePastMonths(db, userId, clock.today(), pickUnlock);
    return listPlants(db, userId);
  });

  app.put('/months/current/plant', async (request): Promise<HomeResponse> => {
    const { plantId } = selectPlantSchema.parse(request.body);
    return selectPlant(db, authOf(request).userId, plantId, clock, attendanceCoins);
  });

  app.post('/unlocks/ack', async (request): Promise<OkResponse> => {
    const { months } = unlockAckSchema.parse(request.body);
    await acknowledgeUnlocks(db, authOf(request).userId, months);
    return { ok: true };
  });
};
