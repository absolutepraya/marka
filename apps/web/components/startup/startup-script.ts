// Runs from the initial HTML, independently of React hydration and app providers.
export const startupScript = `(() => {
  const root = document.documentElement;
  let theme;
  try {
    const cookie = document.cookie.split('; ').find(value => value.startsWith('theme='));
    theme = cookie ? decodeURIComponent(cookie.slice(6)) : localStorage.getItem('theme');
  } catch {}
  if (theme === 'light' || theme === 'dark') root.dataset.startupTheme = theme;
  document.getElementById('marka-startup-retry')?.addEventListener('click', () => location.reload());

  let timer;
  const finish = () => {
    root.dataset.startupReady = 'true';
    document.getElementById('marka-startup-content')?.removeAttribute('inert');
    clearTimeout(timer);
    window.removeEventListener('marka:startup-ready', finish);
    window.removeEventListener('pageshow', resume);
  };
  const resume = event => { if (event.persisted) finish(); };
  window.addEventListener('marka:startup-ready', finish);
  window.addEventListener('pageshow', resume);
  timer = setTimeout(() => {
    if (root.dataset.startupReady !== 'true') {
      root.dataset.startupRecovery = navigator.onLine === false ? 'offline' : 'slow';
    }
  }, 15000);
})();`;
