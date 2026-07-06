// Shim: google-calendar sync lives in workers/shared/ (used by both auth's OAuth
// connect flow and miguri's entry/window sync).
export * from '../../../shared/google-calendar.ts';
