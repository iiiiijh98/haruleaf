import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { diaries, monthlyRecords } from '../src/db/schema';
import { seedCatalog } from '../src/db/seed';
import { bearer } from './auth-helpers';
import { fireConcurrently } from './concurrency';
import { createTestDb, resetDatabase } from './helpers';
import { insertDiaries, mutableClock, signupUser } from './months-helpers';

const { db, pool } = createTestDb();
const clock = mutableClock('2026-10-15');
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ db, clock, corsOrigins: [] });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  clock.set('2026-10-15');
  await resetDatabase(db);
  await seedCatalog(db);
});

const choose = (token: string, plantId = 'monstera') =>
  app.inject({ method: 'PUT', url: '/months/current/plant', headers: bearer(token), payload: { plantId } });
const write = (token: string, body: unknown) =>
  app.inject({ method: 'POST', url: '/diaries', headers: bearer(token), payload: body as object });
const home = async (token: string) => (await app.inject({ method: 'GET', url: '/home', headers: bearer(token) })).json();

async function readyUser(loginId = 'haru_01') {
  const user = await signupUser(app, loginId);
  await choose(user.token);
  return user;
}

describe('POST /diaries', () => {
  it('같은 날 동시에 5번 써도 1편만 저장된다', async () => {
    const { token } = await readyUser();
    const results = await fireConcurrently(5, () => write(token, { body: '동시' }));
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await db.select().from(diaries)).toHaveLength(1);
  });
  it('식물을 고르지 않았으면 409이고 저장하지 않는다', async () => {
    const { token } = await signupUser(app);
    const response = await write(token, { body: '오늘' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'PLANT_NOT_SELECTED', message: '이번 달 식물을 먼저 골라주세요.' } });
    expect(await db.select().from(diaries)).toHaveLength(0);
  });

  it('이미 마감된 달이면 403 MONTH_CLOSED이고 일기를 저장하지 않는다', async () => {
    const { token, userId } = await readyUser();
    await db
      .update(monthlyRecords)
      .set({ finalized: true })
      .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, '2026-10-01')));
    const response = await write(token, { body: '자정 직전' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: 'MONTH_CLOSED', message: '지난달 기록은 읽기 전용이에요.' } });
    expect(await db.select().from(diaries)).toHaveLength(0);
  });

  it('서버 기준 오늘 날짜로 저장하고 식물을 고정한다', async () => {
    const { token, userId } = await readyUser();
    const response = await write(token, { body: '  오늘은\n맑았다  ', date: '2026-10-01' });
    expect(response.statusCode).toBe(201);
    expect(response.json().diary).toMatchObject({ date: '2026-10-15', body: '오늘은\n맑았다' });
    const [record] = await db
      .select()
      .from(monthlyRecords)
      .where(and(eq(monthlyRecords.userId, userId), eq(monthlyRecords.month, '2026-10-01')));
    expect(record!.selectionLocked).toBe(true);
    const snapshot = await home(token);
    expect(snapshot.writtenDays).toBe(1);
    expect(snapshot.growthPercent).toBeCloseTo(100 / 31, 5);
    expect(snapshot.todayDiary).toBe(true);
  });

  it('하루에 한 편', async () => {
    const { token } = await readyUser();
    await write(token, { body: '첫 번째' });
    const response = await write(token, { body: '두 번째' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: 'DIARY_EXISTS', message: '오늘 일기는 이미 있어요. 수정해주세요.' } });
  });

  it.each([
    [{ body: '' }, '일기는 1~10,000자로 써주세요.'],
    [{ body: '가'.repeat(10001) }, '일기는 1~10,000자로 써주세요.'],
    [{ body: '오늘\u0000' }, '사용할 수 없는 문자가 들어 있어요.'],
    [{}, '일기는 1~10,000자로 써주세요.'],
  ])('본문 규칙 위반 %# → 400', async (payload, message) => {
    const { token } = await readyUser();
    const response = await write(token, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message } });
  });
});

describe('GET /diaries', () => {
  it('이번 달 목록을 최신순으로, 오늘 날짜와 수정 가능 여부와 함께', async () => {
    const { token, userId } = await readyUser();
    await insertDiaries(db, userId, ['2026-10-01', '2026-10-03', '2026-09-30']);
    await write(token, { body: '오늘' });
    const response = await app.inject({ method: 'GET', url: '/diaries', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.month).toBe('2026-10');
    expect(body.today).toBe('2026-10-15');
    expect(body.editable).toBe(true);
    expect(body.diaries.map((diary: { date: string }) => diary.date)).toEqual(['2026-10-15', '2026-10-03', '2026-10-01']);
  });

  it('지난달은 읽기 전용으로 표시', async () => {
    const { token, userId } = await readyUser();
    await insertDiaries(db, userId, ['2026-09-30']);
    const body = (await app.inject({ method: 'GET', url: '/diaries?month=2026-09', headers: bearer(token) })).json();
    expect(body.editable).toBe(false);
    expect(body.diaries).toHaveLength(1);
  });

  it('잘못된 월 형식은 400', async () => {
    const { token } = await readyUser();
    const response = await app.inject({ method: 'GET', url: '/diaries?month=2026-13', headers: bearer(token) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe('월 형식이 올바르지 않아요.');
  });

  it('0000년 월은 500이 아니라 400', async () => {
    const { token } = await readyUser();
    const response = await app.inject({ method: 'GET', url: '/diaries?month=0000-01', headers: bearer(token) });
    expect(response.statusCode).toBe(400);
  });

  it('다른 사용자의 일기는 보이지 않는다', async () => {
    const a = await readyUser('haru_01');
    const b = await readyUser('haru_02');
    await write(a.token, { body: 'A의 일기' });
    const list = (await app.inject({ method: 'GET', url: '/diaries', headers: bearer(b.token) })).json();
    expect(list.diaries).toHaveLength(0);
    const detail = await app.inject({ method: 'GET', url: '/diaries/2026-10-15', headers: bearer(b.token) });
    expect(detail.statusCode).toBe(404);
    expect(detail.json()).toEqual({ error: { code: 'DIARY_NOT_FOUND', message: '일기를 찾을 수 없어요.' } });
  });
});

describe('GET /diaries/:date', () => {
  it('상세와 수정 가능 여부', async () => {
    const { token } = await readyUser();
    await write(token, { body: '오늘' });
    const response = await app.inject({ method: 'GET', url: '/diaries/2026-10-15', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ editable: true, diary: { date: '2026-10-15', body: '오늘' } });
  });

  it('존재하지 않는 날짜 형식은 400', async () => {
    const { token } = await readyUser();
    const response = await app.inject({ method: 'GET', url: '/diaries/2026-02-30', headers: bearer(token) });
    expect(response.statusCode).toBe(400);
  });
});

describe('PUT·DELETE /diaries/:date', () => {
  it('0000년 날짜는 500이 아니라 400', async () => {
    const { token } = await readyUser();
    const response = await app.inject({ method: 'GET', url: '/diaries/0000-01-01', headers: bearer(token) });
    expect(response.statusCode).toBe(400);
  });

  it('다른 사용자의 일기는 수정·삭제할 수 없고 원본은 그대로다', async () => {
    const a = await readyUser('haru_01');
    const b = await readyUser('haru_02');
    await write(a.token, { body: 'A의 일기' });
    const notFound = { error: { code: 'DIARY_NOT_FOUND', message: '일기를 찾을 수 없어요.' } };
    const put = await app.inject({ method: 'PUT', url: '/diaries/2026-10-15', headers: bearer(b.token), payload: { body: 'B가 덮어씀' } });
    expect(put.statusCode).toBe(404);
    expect(put.json()).toEqual(notFound);
    const del = await app.inject({ method: 'DELETE', url: '/diaries/2026-10-15', headers: bearer(b.token) });
    expect(del.statusCode).toBe(404);
    expect(del.json()).toEqual(notFound);
    const detail = await app.inject({ method: 'GET', url: '/diaries/2026-10-15', headers: bearer(a.token) });
    expect(detail.json()).toMatchObject({ diary: { date: '2026-10-15', body: 'A의 일기' } });
  });

  it('수정은 작성일수를 바꾸지 않는다', async () => {
    const { token } = await readyUser();
    await write(token, { body: '처음' });
    const response = await app.inject({ method: 'PUT', url: '/diaries/2026-10-15', headers: bearer(token), payload: { body: '고친 글' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().diary.body).toBe('고친 글');
    expect((await home(token)).writtenDays).toBe(1);
  });

  it('삭제하면 성장률이 줄지만 식물 고정은 유지된다', async () => {
    const { token } = await readyUser();
    await write(token, { body: '오늘' });
    const response = await app.inject({ method: 'DELETE', url: '/diaries/2026-10-15', headers: bearer(token) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    const snapshot = await home(token);
    expect(snapshot.writtenDays).toBe(0);
    expect(snapshot.selectionLocked).toBe(true);
    expect((await choose(token, 'rose')).statusCode).toBe(409);
  });

  it('없는 일기는 404', async () => {
    const { token } = await readyUser();
    expect((await app.inject({ method: 'DELETE', url: '/diaries/2026-10-14', headers: bearer(token) })).statusCode).toBe(404);
  });

  it('달이 바뀌면 지난달 일기는 읽기 전용이고 새 달은 식물을 새로 골라야 한다', async () => {
    const { token } = await readyUser();
    await write(token, { body: '10월의 기록' });
    clock.set('2026-11-01');
    const closed = { error: { code: 'MONTH_CLOSED', message: '지난달 기록은 읽기 전용이에요.' } };
    const edit = await app.inject({ method: 'PUT', url: '/diaries/2026-10-15', headers: bearer(token), payload: { body: '고침' } });
    expect(edit.statusCode).toBe(403);
    expect(edit.json()).toEqual(closed);
    const remove = await app.inject({ method: 'DELETE', url: '/diaries/2026-10-15', headers: bearer(token) });
    expect(remove.statusCode).toBe(403);
    const detail = (await app.inject({ method: 'GET', url: '/diaries/2026-10-15', headers: bearer(token) })).json();
    expect(detail.editable).toBe(false);
    expect((await write(token, { body: '11월' })).json().error.code).toBe('PLANT_NOT_SELECTED');
  });
});
