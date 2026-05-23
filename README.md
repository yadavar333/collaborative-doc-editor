# Collaborative Doc Editor

A real-time document editor where multiple people can write in the same document at the same time — think Google Docs, built from scratch. Rich text formatting, live cursors, version history, and dark mode.

**Live demo:** [collabdoc.onrender.com](https://collaborative-doc-editor.onrender.com)

---

## How it works

When two people type at the same time, the server doesn't just reject one of them. Instead it *transforms* each edit's position based on what happened concurrently — that's Operational Transformation, the same algorithm class Google Docs uses. Both documents converge to the same state automatically.

WebSocket connections are stateful (each connection lives on one server process). To support multiple backend instances, every op is published to a Redis channel — all backends subscribe and forward to their local clients, so someone on backend 1 instantly sees edits from someone on backend 2.

```
Browser (Quill.js)
    │  WebSocket + REST
    ▼
 Nginx :8080  ←  reverse proxy + load balancer
    │  round-robin
 ┌──┴──────────┐
 ▼             ▼
backend1     backend2   (Node.js + Express + ws)
 └──────┬──────┘
        │
   ┌────┴────┐
   ▼         ▼
Postgres   Redis
(docs,     (Pub/Sub —
 ops,       one channel
 users)     per doc)
```

---

## Features

- **Custom OT engine** — pure JS, no external library, rich-text aware (bold, lists, code blocks, etc.)
- **Real-time sync** — edits appear in < 50 ms on LAN
- **Live cursors** — coloured per-user cursor positions
- **Presence bar** — see who's editing right now
- **Rich text** — bold, italic, headers, bullet lists, code blocks
- **JWT auth** — register / login, token-protected routes
- **Document sharing** — invite collaborators by email as editor or viewer
- **Version history** — every op is stored; browse and preview any past state
- **Export** — download the current document as plain text
- **Dark / light mode** — persisted across sessions
- **Delete documents** — editors can permanently remove a doc

---

## Run locally

Requires Docker.

```bash
git clone https://github.com/yadavar333/collaborative-doc-editor
cd collaborative-doc-editor

docker compose up --build
```

| URL | What |
|-----|------|
| http://localhost:8080 | The app |
| http://localhost:4001/health | Backend 1 health check |
| http://localhost:4002/health | Backend 2 health check |

---

## Run tests

```bash
cd server
npm install
npm test
```

19 unit tests covering the OT engine — all passing.

---

## Deploy for free

The whole stack runs as a single Node.js service (frontend is served as static files):

1. **[Render](https://render.com)** — web service, free tier (`render.yaml` included)
2. **[Neon](https://neon.tech)** — free Postgres (run `server/src/db/schema.sql` in their SQL editor)
3. **[Upstash](https://upstash.com)** — free Redis (copy the `rediss://` URL)

Set three env vars in Render: `DATABASE_URL`, `REDIS_URL`, `SERVE_CLIENT=true`.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Quill.js, React Router, Vite |
| Backend | Node.js 20, Express, ws |
| OT engine | Custom JS — no library |
| Database | PostgreSQL 15 |
| Pub/Sub | Redis 7 |
| Proxy | Nginx (local Docker only) |
| Containers | Docker, Docker Compose |
| Tests | Jest |
