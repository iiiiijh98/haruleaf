export const FORM_MESSAGE = '입력값을 확인해주세요.';
export const INVALID_CHARACTER_MESSAGE = '사용할 수 없는 문자가 들어 있어요.';

/** PostgreSQL text에는 NUL(\u0000)을 저장할 수 없다. */
export const hasNoNul = (value: string): boolean => !value.includes('\u0000');
