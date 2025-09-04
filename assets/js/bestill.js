const API_BASE = window.RENDER_API_URL || '';

async function submitOrder(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    alert('Bestilling sendt');
    form.reset();
  } else {
    alert('Feil ved sending');
  }
}
