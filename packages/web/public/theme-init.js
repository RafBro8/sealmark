// Applies a saved theme before first paint, so a dark-mode choice does not
// flash light on load. A separate file rather than an inline <script>, because
// the Content-Security-Policy forbids inline scripts.
try {
  var saved = localStorage.getItem('sealmark-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
} catch (e) {
  // Storage can be unavailable (private mode, blocked site data). Fall back to
  // the system preference, which the stylesheet handles on its own.
}
