import { useEffect, useState } from 'react';

export function App() {
  const [apiStatus, setApiStatus] = useState<string>('проверяю...');

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((d: { status: string }) => setApiStatus(d.status))
      .catch(() => setApiStatus('недоступен'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', padding: 32 }}>
      <h1>Сервис грамот — каркас</h1>
      <p>
        API: <b>{apiStatus}</b>
      </p>
    </main>
  );
}
