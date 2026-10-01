/** drizzle가 감싼 pg 오류(cause) 또는 pg 오류에서 유일 제약 위반(23505)인지 확인한다. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  const name = e?.cause?.constraint ?? e?.constraint;
  return code === '23505' && name === constraint;
}
