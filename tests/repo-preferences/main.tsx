import React from 'react';
import { createRoot } from 'react-dom/client';
import RepoPage from '../../src/components/repo/RepoPage';
import { initAuth, setAuth } from '../../src/stores/auth';
import { $favorites } from '../../src/stores/favorites';

createRoot(document.getElementById('root')!).render(<>
  <button id="change-preferences" onClick={() => {
    setAuth({ oshiMember: '森田ひかる' });
    $favorites.set([{ name: '山川宇衣', group: '樱坂46', imageUrl: '', addedAt: 1 }]);
  }}>Simulate preference change</button>
  <RepoPage initialMode="generator" />
</>);
void initAuth();
