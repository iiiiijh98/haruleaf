import {
  diaryDateSchema,
  diaryInputSchema,
  monthKeyOf,
  monthKeySchema,
  type DiaryListResponse,
  type DiaryMutationResponse,
  type DiaryResponse,
  type OkResponse,
} from '@haruleaf/shared';
import { createDiary, deleteDiary, getDiary, listDiaries, updateDiary } from '../domain/diaries';
import { authOf } from '../plugins/auth';
import type { ProtectedPlugin } from './protected';

type DateParams = { Params: { date: string } };

export const diaryRoutes: ProtectedPlugin = async (app, { db, clock }) => {
  app.post('/diaries', async (request, reply) => {
    const { body } = diaryInputSchema.parse(request.body);
    const diary = await createDiary(db, authOf(request).userId, body, clock);
    const response: DiaryMutationResponse = { diary };
    return reply.status(201).send(response);
  });

  app.get('/diaries', async (request): Promise<DiaryListResponse> => {
    const { month } = request.query as { month?: string };
    const key = month === undefined ? monthKeyOf(clock.today()) : monthKeySchema.parse(month);
    return listDiaries(db, authOf(request).userId, key, clock);
  });

  app.get<DateParams>('/diaries/:date', async (request): Promise<DiaryResponse> => {
    const date = diaryDateSchema.parse(request.params.date);
    return getDiary(db, authOf(request).userId, date, clock);
  });

  app.put<DateParams>('/diaries/:date', async (request): Promise<DiaryMutationResponse> => {
    const date = diaryDateSchema.parse(request.params.date);
    const { body } = diaryInputSchema.parse(request.body);
    return { diary: await updateDiary(db, authOf(request).userId, date, body, clock) };
  });

  app.delete<DateParams>('/diaries/:date', async (request): Promise<OkResponse> => {
    const date = diaryDateSchema.parse(request.params.date);
    await deleteDiary(db, authOf(request).userId, date, clock);
    return { ok: true };
  });
};
