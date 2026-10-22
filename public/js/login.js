const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const btn = document.getElementById('btn-login');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  btn.disabled = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('input-user').value.trim(),
        password: document.getElementById('input-pass').value
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.href = 'host.html';
      return;
    }
    errorEl.textContent = data.error || 'Không đăng nhập được. Thử lại sau.';
    document.getElementById('input-pass').value = '';
  } catch (err) {
    errorEl.textContent = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
  btn.disabled = false;
});
