import type { AttendanceResponse, PurchaseInput, PurchaseResponse, ShopResponse } from '@haruleaf/shared';
import { apiRequest } from './client';

export const attendRequest = () => apiRequest<AttendanceResponse>('/attendance', { method: 'POST' });

export const fetchShop = () => apiRequest<ShopResponse>('/shop');

export const purchaseRequest = (input: PurchaseInput) =>
  apiRequest<PurchaseResponse>('/shop/purchase', { method: 'POST', body: input });
