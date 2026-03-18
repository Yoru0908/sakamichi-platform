import { atom } from 'nanostores';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  fetchMe,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '@/utils/auth-api';

export type UserRole = 'guest' | 'member' | 'verified' | 'translator' | 'admin';

export interface AuthState {
  isLoggedIn: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isFirstLogin: boolean;
  oshiMember: string | null;
  verificationStatus: 'none' | 'pending' | 'approved' | 'rejected';
  loading: boolean;
}

const defaultAuth: AuthState = {
  isLoggedIn: false,
  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  role: 'guest',
  isFirstLogin: false,
  oshiMember: null,
  verificationStatus: 'none',
  loading: false,
};

export const $auth = atom<AuthState>(defaultAuth);

// ── Helpers ──

function userToState(user: AuthUser): AuthState {
  return {
    isLoggedIn: true,
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isFirstLogin: user.isFirstLogin,
    oshiMember: user.oshiMember,
    verificationStatus: user.verificationStatus,
    loading: false,
  };
}

export function setAuth(state: Partial<AuthState>) {
  $auth.set({ ...$auth.get(), ...state });
}

// ── Actions ──

/** Initialize auth state from server (call on app load) */
export async function initAuth(): Promise<void> {
  setAuth({ loading: true });
  const res = await fetchMe();
  if (res.success && res.data?.user) {
    $auth.set(userToState(res.data.user));
  } else {
    $auth.set({ ...defaultAuth, loading: false });
  }
}

/** Email + password login */
export async function login(req: LoginRequest): Promise<{ success: boolean; error?: string; isFirstLogin?: boolean }> {
  const res = await apiLogin(req);
  if (res.success && res.data?.user) {
    $auth.set(userToState(res.data.user));
    return { success: true, isFirstLogin: res.data.user.isFirstLogin };
  }
  return { success: false, error: res.message || res.error || '登录失败' };
}

/** Email registration */
export async function register(req: RegisterRequest): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await apiRegister(req);
  if (res.success) {
    return { success: true, message: res.data?.message || res.message };
  }
  return { success: false, error: res.message || res.error || '注册失败' };
}

/** Logout */
export async function logout(): Promise<void> {
  await apiLogout();
  $auth.set({ ...defaultAuth, loading: false });
}
