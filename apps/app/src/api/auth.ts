import type {
  AuthResponse,
  DeleteAccountInput,
  LoginInput,
  MeResponse,
  OkResponse,
  SignupInput,
  UpdateNicknameInput,
} from '@haruleaf/shared';
import { apiRequest } from './client';

export const signupRequest = (input: SignupInput) =>
  apiRequest<AuthResponse>('/auth/signup', { method: 'POST', body: input, token: null });

export const loginRequest = (input: LoginInput) =>
  apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: input, token: null });

export const logoutRequest = (token: string) => apiRequest<OkResponse>('/auth/logout', { method: 'POST', token });

export const fetchMe = (token?: string) => apiRequest<MeResponse>('/me', token === undefined ? {} : { token });

export const updateNicknameRequest = (input: UpdateNicknameInput) =>
  apiRequest<MeResponse>('/me', { method: 'PATCH', body: input });

export const deleteAccountRequest = (input: DeleteAccountInput) =>
  apiRequest<OkResponse>('/me', { method: 'DELETE', body: input });
