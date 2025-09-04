const API_BASE = window.RENDER_API_URL || '';

async function submitFeedback(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.rating = Number(data.rating);
  data.anonymous = form.anonymous.checked;
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (res.ok) {
    alert('Takk for tilbakemeldingen');
    form.reset();
  } else {
    alert('Feil ved sending');
  }
}
