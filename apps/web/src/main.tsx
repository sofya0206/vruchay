import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { handleSessionLost } from './auth/session-lost';
import { hideSplash } from './render/hide-splash';
import { applyStoredTheme } from './settings/preferences';
import { ThemeProvider } from './settings/theme';
import './index.css';

// Тему ставим до первой отрисовки: ответ сервера придёт позже, и кабинет
// успел бы мигнуть светлым у того, кто выбрал тёмную.
applyStoredTheme();

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error) => handleSessionLost(error, queryClient) }),
  mutationCache: new MutationCache({ onError: (error) => handleSessionLost(error, queryClient) }),
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 10_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Заставку из разметки убираем, как только приложение отрисовалось.
// Плавно, а не рывком: резкая подмена картинки читается как сбой.
// На странице печати её к этому времени уже нет — там она снимается
// разметкой, до запуска приложения.
hideSplash();
