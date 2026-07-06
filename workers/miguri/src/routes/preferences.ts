// Shim: re-export shared auth helpers so moved route files keep their imports unchanged.
export {
  getAccessToken,
  getAuthUserId,
  getAuthUser,
  getUserMemberPreferences,
  mergePreferredMembers,
} from '../../../shared/auth-helpers.ts';
