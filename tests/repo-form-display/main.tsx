import React from 'react';
import { createRoot } from 'react-dom/client';
import RepoPage from '../../src/components/repo/RepoPage';
import LanguageSwitch from '../../src/components/ui/LanguageSwitch';
import { initAuth } from '../../src/stores/auth';
import './styles.css';
createRoot(document.getElementById('root')!).render(<>
  <div style={{ display: 'flex', justifyContent: 'flex-end', whiteSpace: 'nowrap', height: 56 }}><LanguageSwitch /></div>
  <RepoPage initialMode="generator" />
</>);
void initAuth();
