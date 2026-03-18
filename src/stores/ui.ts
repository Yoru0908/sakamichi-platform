import { atom } from 'nanostores';

export const $mobileDrawerOpen = atom(false);

export function openDrawer() {
  $mobileDrawerOpen.set(true);
  document.body.style.overflow = 'hidden';
}

export function closeDrawer() {
  $mobileDrawerOpen.set(false);
  document.body.style.overflow = '';
}

export function toggleDrawer() {
  $mobileDrawerOpen.get() ? closeDrawer() : openDrawer();
}
