import { useEffect, useState } from 'react';

/**
 * Whether the browser believes it has a connection. Only used to explain what
 * will happen - a timestamp request is still attempted and its real outcome
 * reported, since `navigator.onLine` can say "online" behind a dead network.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
