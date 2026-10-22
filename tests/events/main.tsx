import React from 'react';
import { createRoot } from 'react-dom/client';
import { setAuth } from '../../src/stores/auth';
import SakamichiEvents from '../../src/components/events/SakamichiEvents';
import './styles.css';
setAuth({ isLoggedIn: true, userId: 'fixture-a', loading: false });
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl p-4"><SakamichiEvents /></main>);
