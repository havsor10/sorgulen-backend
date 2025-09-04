# Sørgulen Industriservice

Node/Express backend with MongoDB and static frontend.

## Lokal utvikling

```bash
npm install
cp .env.example .env # fyll ut variabler
npm start
```

## Deploy

### Render
Deploy repo og bruk `render.yaml`.

### Netlify
Netlify bruker `netlify.toml` og må ha environment `RENDER_API_URL`.

## Curl-eksempler

```bash
# Sett miljøvariabel for API-basisen
API="https://<din-render-backend>.onrender.com/api"

# 1) Healthcheck
curl -s "$API/health"

# 2) Login (får JWT)
TOKEN=$(curl -s -X POST "$API/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"havsor10","password":"Lussi100898"}' | jq -r .token)

echo "$TOKEN"

# 3) Ny ordre (kunde)
curl -s -X POST "$API/orders" \
  -H "Content-Type: application/json" \
  -d '{"service":"Trefelling","name":"Test Kunde","phone":"+47 99999999","email":"test@example.com","message":"Hei"}'

# 4) Hent ordrer (admin)
curl -s "$API/orders?limit=10&page=1" \
  -H "Authorization: Bearer $TOKEN"

# 5) Feedback anonym
curl -s -X POST "$API/feedback" \
  -H "Content-Type: application/json" \
  -d '{"rating":5,"comment":"Bra side","anonymous":true}'

# 6) Feedback med navn
curl -s -X POST "$API/feedback" \
  -H "Content-Type: application/json" \
  -d '{"rating":4,"comment":"Foreslår mørkere tekst","anonymous":false,"name":"Kari","email":"kari@example.com"}'

# 7) Hent feedback (admin)
curl -s "$API/feedback?limit=10&page=1" \
  -H "Authorization: Bearer $TOKEN"
```

## Endringslogg

Se [CHANGELOG.md](CHANGELOG.md).
