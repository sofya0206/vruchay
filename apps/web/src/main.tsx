import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
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
const splash = document.getElementById('splash');
if (splash) {
  splash.style.transition = 'opacity 0.25s ease-out';
  splash.style.opacity = '0';
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
  // Страховка: если переход не случится (вкладка в фоне — браузер
  // не проигрывает анимации), заставка всё равно должна исчезнуть.
  setTimeout(() => splash.remove(), 600);
}
