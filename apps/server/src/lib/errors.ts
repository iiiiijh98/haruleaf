import type { ApiErrorBody } from '@haruleaf/shared';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

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

function send(reply: FastifyReply, status: number, code: string, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  return reply.status(status).send(body);
}

// @haruleaf/shared가 자체 zod 사본을 쓸 수 있어 instanceof만으로는 놓친다.
function isZodError(error: unknown): error is ZodError {
  return (
    error instanceof ZodError ||
    (error instanceof Error && error.name === 'ZodError' && Array.isArray((error as { issues?: unknown }).issues))
  );
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return send(reply, error.status, error.code, error.message);
    }
    if (isZodError(error)) {
      return send(reply, 400, 'VALIDATION_ERROR', error.issues[0]?.message ?? '입력값을 확인해주세요.');
    }
    const status = 'statusCode' in error ? error.statusCode : undefined;
    if (status && status >= 400 && status < 500) {
      return send(reply, status, 'BAD_REQUEST', '요청 형식이 올바르지 않아요.');
    }
    request.log.error({ err: error }, 'unhandled error');
    return send(reply, 500, 'INTERNAL', '잠시 후 다시 시도해주세요.');
  });

  app.setNotFoundHandler((_request, reply) => send(reply, 404, 'NOT_FOUND', '요청한 기능을 찾을 수 없어요.'));
}
