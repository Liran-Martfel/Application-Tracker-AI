const f = document.getElementById('f'), err = document.getElementById('err'), go = document.getElementById('go');
f.addEventListener('submit', async (e) => {
  e.preventDefault(); err.hidden = true; go.disabled = true; go.textContent = 'בודק…';
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value, remember: document.getElementById('remember').checked }) });
    if (r.ok) { location.href = '/app'; return; }
    err.textContent = r.status === 429 ? 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.' : r.status === 401 ? 'הסיסמה לא נכונה.' : 'הכניסה לא זמינה כרגע.';
  } catch { err.textContent = 'אין חיבור. אפשר לנסות שוב.'; }
  err.hidden = false; go.disabled = false; go.textContent = 'כניסה';
});
