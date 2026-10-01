import { selectPlantSchema, type HomeResponse, type PlantsResponse } from '@haruleaf/shared';
import { getHome, listPlants, selectPlant } from '../domain/months';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const homeRoutes: ProtectedPlugin = async (app, { db, clock }) => {
  app.get('/home', async (request): Promise<HomeResponse> => getHome(db, authOf(request).userId, clock));

  app.get('/plants', async (request): Promise<PlantsResponse> => listPlants(db, authOf(request).userId));

  app.put('/months/current/plant', async (request): Promise<HomeResponse> => {
    const { plantId } = selectPlantSchema.parse(request.body);
    return selectPlant(db, authOf(request).userId, plantId, clock);
  });
};
