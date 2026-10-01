import { z } from 'zod';
import { FORM_MESSAGE, hasNoNul, INVALID_CHARACTER_MESSAGE } from './text';

export const LOGIN_ID_MESSAGE = '아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요.';
export const PASSWORD_LENGTH_MESSAGE = '비밀번호는 8~64자로 입력해주세요.';
export const PASSWORD_SPACE_MESSAGE = '비밀번호에는 공백을 쓸 수 없어요.';
export const PASSWORD_MIX_MESSAGE = '비밀번호에 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요.';
export const NICKNAME_MESSAGE = '닉네임은 1~10자로 입력해주세요.';
export const PASSWORD_RULE_HELP = '8~64자, 대문자·숫자·특수문자를 각각 1자 이상 넣어주세요.';

const PASSWORD_REQUIRED = '비밀번호를 입력해주세요.';

export const loginIdSchema = z
  .string({ error: LOGIN_ID_MESSAGE })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, LOGIN_ID_MESSAGE);

export const passwordSchema = z
  .string({ error: PASSWORD_LENGTH_MESSAGE })
  .min(8, PASSWORD_LENGTH_MESSAGE)
  .max(64, PASSWORD_LENGTH_MESSAGE)
  .refine((value) => !/\s/.test(value), PASSWORD_SPACE_MESSAGE)
  .refine(
    (value) => /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value),
    PASSWORD_MIX_MESSAGE,
  );

export const nicknameSchema = z
  .string({ error: NICKNAME_MESSAGE })
  .trim()
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 1 && length <= 10;
  }, NICKNAME_MESSAGE)
  .refine(hasNoNul, INVALID_CHARACTER_MESSAGE);

const passwordInput = z
  .string({ error: PASSWORD_REQUIRED })
  .min(1, PASSWORD_REQUIRED)
  .max(64, '비밀번호를 확인해주세요.');

export const signupSchema = z.object(
  { loginId: loginIdSchema, password: passwordSchema, nickname: nicknameSchema },
  { error: FORM_MESSAGE },
);

export const loginSchema = z.object(
  {
    loginId: z
      .string({ error: '아이디를 입력해주세요.' })
      .trim()
      .toLowerCase()
      .min(1, '아이디를 입력해주세요.')
      .max(100, '아이디를 확인해주세요.'),
    password: passwordInput,
  },
  { error: FORM_MESSAGE },
);

export const updateNicknameSchema = z.object({ nickname: nicknameSchema }, { error: FORM_MESSAGE });

export const deleteAccountSchema = z.object({ password: passwordInput }, { error: FORM_MESSAGE });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateNicknameInput = z.infer<typeof updateNicknameSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export type User = {
  id: string;
  loginId: string;
  nickname: string;
  coinBalance: number;
  /** ISO 8601 */
  createdAt: string;
};

export type AuthResponse = { token: string; user: User };
export type MeResponse = { user: User };
export type OkResponse = { ok: true };
