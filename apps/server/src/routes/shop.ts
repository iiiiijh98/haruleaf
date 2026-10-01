import { purchaseSchema, type PurchaseResponse, type ShopResponse } from '@haruleaf/shared';
import { listShop, purchase } from '../domain/shop';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const shopRoutes: ProtectedPlugin = async (app, { db }) => {
  app.get('/shop', async (request): Promise<ShopResponse> => listShop(db, authOf(request).userId));

  app.post('/shop/purchase', async (request): Promise<PurchaseResponse> => {
    const { plantId } = purchaseSchema.parse(request.body);
    return purchase(db, authOf(request).userId, plantId);
  });
};
