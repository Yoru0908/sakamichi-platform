import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminDashboard from '../../src/components/admin/AdminDashboard';
import './styles.css';
createRoot(document.getElementById('root')!).render(<main className="p-4 sm:p-8"><AdminDashboard /></main>);
