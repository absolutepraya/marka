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
    delete root.dataset.startupRecovery;
    document.getElementById('marka-startup-content')?.removeAttribute('inert');
    clearTimeout(timer);
    window.removeEventListener('marka:startup-ready', finish);
    window.removeEventListener('pageshow', resume);
  };
  const recover = () => {
    if (root.dataset.startupReady === 'true') return;
    const recovery = navigator.onLine === false ? 'offline' : 'slow';
    root.dataset.startupRecovery = recovery;
    const message = document.getElementById('marka-startup-message');
    if (message?.dataset[recovery]) message.textContent = message.dataset[recovery];
  };
  // History restoration is not proof that a suspended destination hydrated.
  const resume = event => { if (event.persisted) recover(); };
  window.addEventListener('marka:startup-ready', finish);
  window.addEventListener('pageshow', resume);
  if (root.dataset.startupReady === 'true') finish();
  else timer = setTimeout(recover, 15000);
})();`;
