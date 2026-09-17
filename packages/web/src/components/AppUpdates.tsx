import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Tells the signer when Sealmark has finished saving itself for offline use, and
 * when a newer version is ready. The update is never applied on its own: a
 * reload in the middle of placing fields would lose them.
 */
export function AppUpdates() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ onRegisterError: () => undefined });

  if (needRefresh) {
    return (
      <div className="toast" role="status">
        <span>A new version of Sealmark is ready.</span>
        <button type="button" className="btn" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div className="toast" role="status">
        <span>Sealmark is saved on this device and now works offline.</span>
        <button type="button" className="btn btn-quiet" onClick={() => setOfflineReady(false)}>
          OK
        </button>
      </div>
    );
  }

  return null;
}
