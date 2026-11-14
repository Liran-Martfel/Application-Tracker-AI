document.getElementById('logout').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/'; });
