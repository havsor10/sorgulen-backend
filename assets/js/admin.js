const API_BASE = window.RENDER_API_URL || '';

async function login(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (res.ok && json.token) {
    sessionStorage.setItem('authToken', json.token);
    alert('Innlogget');
  } else {
    alert('Feil innlogging');
  }
}

async function fetchOrders() {
  const token = sessionStorage.getItem('authToken');
  const res = await fetch(`${API_BASE}/api/orders`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

async function fetchFeedback() {
  const token = sessionStorage.getItem('authToken');
  const res = await fetch(`${API_BASE}/api/feedback`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
