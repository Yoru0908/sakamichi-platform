import { atom } from 'nanostores';
import { singleFlight } from '@/utils/single-flight';
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
  geoStatus: string | null;
  paymentStatus: string | null;
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
  geoStatus: null,
  paymentStatus: null,
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
    geoStatus: user.geoStatus,
    paymentStatus: user.paymentStatus,
    loading: false,
  };
}

let authRevision = 0;
let initializedAt: number | null = null;
const INIT_REUSE_MS = 30_000;

export function setAuth(state: Partial<AuthState>) {
  // A profile edit must not be overwritten by an older initialization response.
  authRevision += 1;
  $auth.set({ ...$auth.get(), ...state });
}

// ── Actions ──

const initialize = singleFlight(async (): Promise<void> => {
  const revision = authRevision;
  $auth.set({ ...$auth.get(), loading: true });
  const res = await fetchMe();
  if (revision !== authRevision) {
    $auth.set({ ...$auth.get(), loading: false });
    return;
  }
  if (res.success && res.data?.user) {
    $auth.set(userToState(res.data.user));
    initializedAt = Date.now();
  } else {
    $auth.set({ ...defaultAuth, loading: false });
    // Do not retain failures: recovery should not wait for a frontend cache TTL.
    initializedAt = null;
  }
});

/** Reuse recent successful initialization across islands; never replace authorization. */
export function initAuth(force = false): Promise<void> {
  if (!force && initializedAt !== null && Date.now() - initializedAt < INIT_REUSE_MS) {
    return Promise.resolve();
  }
  return initialize();
}

/** Email + password login */
export async function login(req: LoginRequest): Promise<{ success: boolean; error?: string; isFirstLogin?: boolean }> {
  authRevision += 1;
  initializedAt = null;
  const res = await apiLogin(req);
  if (res.success && res.data?.user) {
    authRevision += 1;
    $auth.set(userToState(res.data.user));
    initializedAt = Date.now();
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
  authRevision += 1;
  initializedAt = null;
  await apiLogout();
  authRevision += 1;
  $auth.set({ ...defaultAuth, loading: false });
}
