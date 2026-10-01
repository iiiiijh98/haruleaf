import type { AttendanceResponse } from '@haruleaf/shared';
import { attend } from '../domain/coins';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

export const coinRoutes: ProtectedPlugin = async (app, { db, clock, attendanceCoins }) => {
  app.post('/attendance', async (request): Promise<AttendanceResponse> =>
    attend(db, authOf(request).userId, clock.today(), attendanceCoins),
  );
};
