import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { queryClient } from './lib/query';
import { applyInitialTextSize } from './lib/text-size';

// Áp dụng chế độ chữ lớn trước khi render để tránh nhấp nháy.
applyInitialTextSize();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Không tìm thấy #root trong index.html');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
