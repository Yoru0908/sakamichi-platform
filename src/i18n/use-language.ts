import { useSyncExternalStore } from 'react';
import { $language, type Language } from '@/stores/language';

const subscribe = (listener: () => void) => $language.listen(listener);
const snapshot = () => $language.get();
const serverSnapshot = (): Language => 'zh';

// Static pages are rendered in Chinese. Hydrate that same snapshot first, then
// apply the saved locale; avoids React hydration mismatches on a Japanese reload.
export function useLanguage() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
