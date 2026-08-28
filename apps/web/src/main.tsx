import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { hideSplash } from './render/hide-splash';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 10_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

// Заставку из разметки убираем, как только приложение отрисовалось.
// Плавно, а не рывком: резкая подмена картинки читается как сбой.
// На странице печати её к этому времени уже нет — там она снимается
// разметкой, до запуска приложения.
hideSplash();
