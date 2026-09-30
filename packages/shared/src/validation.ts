type IssueLike = { path: ReadonlyArray<PropertyKey>; message: string };

/** Zod 오류에서 최상위 필드별 첫 메시지만 모은다(폼 칸 아래 표시용). */
export function firstIssueByField(error: { issues: ReadonlyArray<IssueLike> }): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === undefined) continue;
    const field = String(key);
    if (!(field in result)) result[field] = issue.message;
  }
  return result;
}
