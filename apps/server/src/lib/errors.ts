import { z, type ApiErrorBody } from '@haruleaf/shared';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  stack?: unknown;
  cause?: { code?: unknown; constraint?: unknown; table?: unknown };
};

/** V8 스택 프레임 줄: "    at 함수 (파일:줄:칸)" 또는 "    at 파일:줄:칸" */
const STACK_FRAME = /^\s+at .+:\d+:\d+\)?$/;

/**
 * 로그용 오류 요약. DB 오류 message에는 쿼리 파라미터(일기 본문 등)가 들어있어 message는 남기지 않는다.
 * 스택 앞부분에는 message가 그대로 들어있으므로 message 뒤부터, 프레임 형식인 줄만 남긴다.
 */
export function serializeError(error: unknown) {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  let stack: string | undefined;
  if (typeof e.stack === 'string') {
    const message = typeof e.message === 'string' ? e.message : '';
    const index = message ? e.stack.indexOf(message) : -1;
    const afterMessage = index >= 0 ? e.stack.slice(index + message.length) : e.stack;
    const frames = afterMessage.split('\n').filter((line) => STACK_FRAME.test(line));
    stack = frames.length > 0 ? frames.join('\n') : undefined;
  }
  return {
    name: typeof e.name === 'string' ? e.name : 'Error',
    code: e.cause?.code ?? e.code,
    constraint: e.cause?.constraint,
    table: e.cause?.table,
    stack,
  };
}

export const unauthorized = () => new AppError('UNAUTHORIZED', '다시 로그인해주세요.', 401);

function send(reply: FastifyReply, status: number, code: string, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  return reply.status(status).send(body);
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return send(reply, error.status, error.code, error.message);
    }
    if (error instanceof z.ZodError) {
      return send(reply, 400, 'VALIDATION_ERROR', error.issues[0]?.message ?? '입력값을 확인해주세요.');
    }
    const status = 'statusCode' in error ? error.statusCode : undefined;
    if (status && status >= 400 && status < 500) {
      return send(reply, status, 'BAD_REQUEST', '요청 형식이 올바르지 않아요.');
    }
    request.log.error({ error: serializeError(error) }, 'unhandled error');
    return send(reply, 500, 'INTERNAL', '잠시 후 다시 시도해주세요.');
  });

  app.setNotFoundHandler((_request, reply) => send(reply, 404, 'NOT_FOUND', '요청한 기능을 찾을 수 없어요.'));
}
