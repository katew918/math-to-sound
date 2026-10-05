import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { recordVisit } from './lib/visits';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Only on the published site: `npm run dev` must never touch the count.
recordVisit({ enabled: import.meta.env.PROD });
