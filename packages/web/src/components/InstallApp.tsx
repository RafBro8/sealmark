import { useEffect, useState } from 'react';
import { DownloadIcon, MinusIcon, PlusIcon } from './Icons.js';

/**
 * Turns "installs as an app from your browser" from a claim into something a
 * person can act on.
 *
 * Every platform hides installing somewhere different, and none of them are
 * where a non-technical person would look. Chrome and Edge at least hand the
 * page a real prompt, so there we show a button that opens the native dialog.
 * Everywhere else there is no such API and the honest answer is instructions.
 */

/** Chrome and Edge fire this so a page can offer its own install button. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STEPS: Array<{ where: string; how: string }> = [
  { where: 'Chrome or Edge, on a computer', how: 'Click the install icon at the right-hand end of the address bar. If it is not there, open the browser menu and look for "Install".' },
  { where: 'Safari, on a Mac', how: 'File menu, then "Add to Dock".' },
  { where: 'iPhone or iPad', how: 'Tap the Share button, then "Add to Home Screen".' },
  { where: 'Android', how: 'Open the browser menu, then "Install app" or "Add to Home screen".' },
];

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already running as an installed app: there is nothing to offer.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari predates the standard and has its own flag.
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const onPrompt = (event: Event) => {
      // Keep the browser's own banner out of the way; this page asks instead.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // The event is single use whatever the person chose.
    setPrompt(null);
  };

  return (
    <div className="install-app">
      {prompt ? (
        <button type="button" className="btn" onClick={install}>
          <DownloadIcon size={14} />
          Install Sealmark on this device
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          aria-expanded={showSteps}
          onClick={() => setShowSteps((open) => !open)}
        >
          {showSteps ? <MinusIcon size={13} /> : <PlusIcon size={13} />}
          {showSteps ? 'Hide the steps' : 'How to install it on this device'}
        </button>
      )}

      {showSteps && (
        <dl className="install-steps">
          {STEPS.map(({ where, how }) => (
            <div key={where}>
              <dt>{where}</dt>
              <dd>{how}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="install-note">
        Installing keeps a copy on your device. It opens in its own window, works with no
        internet connection, and there is nothing to sign up for.
      </p>
    </div>
  );
}
