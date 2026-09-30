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
  code?: unknown;
  stack?: unknown;
  cause?: { code?: unknown; constraint?: unknown; table?: unknown };
};

/** 로그용 오류 요약. DB 오류 message에는 쿼리 파라미터가 들어있어 message는 남기지 않는다. */
export function serializeError(error: unknown) {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  const stack =
    typeof e.stack === 'string'
      ? e.stack
          .split('\n')
          .filter((line) => line.trim().startsWith('at '))
          .join('\n')
      : undefined;
  return {
    name: typeof e.name === 'string' ? e.name : 'Error',
    code: e.cause?.code ?? e.code,
    constraint: e.cause?.constraint,
    table: e.cause?.table,
    stack,
  };
}

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
