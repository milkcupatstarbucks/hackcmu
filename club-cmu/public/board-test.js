fetch('/api/health').then(r => r.json()).then(health => {
  if (!health.localDemo) { document.body.textContent = 'This test page requires LOCAL_DEMO=true in non-production mode. Use the main game to sign in.'; return; }
  BoardConnection.configure({ getName: () => 'Student ' + Math.floor(Math.random() * 1000) });
  const reopen = document.createElement('button');
  reopen.textContent = 'Open shared board';
  reopen.onclick = () => Whiteboard.open('the-fence');
  document.body.prepend(reopen);
  Whiteboard.open('the-fence');
}).catch(() => { document.body.textContent = 'Server unavailable. Check Docker logs.'; });
