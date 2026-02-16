# Real-time Collaborative Document Editor

A Google Docs–style collaborative editor built from scratch. Multiple users can edit the same document simultaneously — conflicts are resolved in real time using a custom Operational Transformation (OT) engine. Horizontally scalable via Nginx load balancing and Redis Pub/Sub.

## Architecture

```
Browser (Quill.js editor)
        │  WebSocket + REST
        ▼
┌───────────────┐
│     Nginx     │  Port 8080 — reverse proxy + WebSocket upgrade
│ Load Balancer │
└──────┬────────┘
       │  Round-robin
  ┌────┴─────────────────┐
  │                      │
  ▼                      ▼
Backend 1            Backend 2          ← two Node.js instances
(Express + WS)       (Express + WS)
  │                      │
  └──────────┬───────────┘
             │
     ┌───────┴────────┐
     │                │
     ▼                ▼
PostgreSQL           Redis
(documents,         (Pub/Sub channel
 operations,         per document)
 users, cursors)
```

**Redis Pub/Sub** ensures that an edit submitted to backend1 is broadcast to all clients connected to backend2 — the system stays consistent across instances.

## Features

- **Custom OT Engine** — pure JS character-based Operational Transformation. 9 component-interaction rules, convergence guaranteed.
- **Real-time sync** — WebSocket-based; edits appear < 50 ms on LAN.
- **Remote cursors** — coloured per-user cursor positions via `quill-cursors`.
- **Presence bar** — live avatar strip showing all connected collaborators.
- **JWT Auth** — register/login, Bearer-token protected REST + WS routes.
- **Document sharing** — share by email with `editor` or `viewer` role.
- **Version history** — full operation log with point-in-time reconstruction.
- **Snapshotting** — auto-compacts every 100 ops to keep document load fast.
- **Export** — download current document as `.txt`.
- **Horizontal scaling** — Nginx round-robin + Redis fanout, proven by load test.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/yadavar333/collaborative-doc-editor
cd collaborative-doc-editor

# 2. Bring up the full stack
docker compose up --build

# Application: http://localhost:8080
# Backend 1:   http://localhost:4001/health
# Backend 2:   http://localhost:4002/health
```

## Run Tests

```bash
cd server
npm install
npm test
# 19 OT engine unit tests — all passing
```

## Load Test

```bash
npm install -g artillery
artillery run loadtest.yml
# Simulates 50 concurrent WebSocket users sending ops for 10 seconds
```

## What This Project Demonstrates

- **Operational Transformation** — the algorithm at the core of Google Docs. When two users type at the same time, the server transforms their operations so both documents converge to the same state.
- **Scaling WebSockets** — WebSockets are stateful (each connection lives on one server process), but Redis Pub/Sub lets multiple instances share state without coupling.
- **Event-sourcing pattern** — every edit is stored as an immutable operation. The document state is derived by replaying operations from a snapshot.
- **Snapshotting** — replaying millions of operations on every load is slow. Periodic snapshots cap the replay cost at O(ops since last snapshot).

## What I Learned

I learned how hard it is to resolve text conflicts without simply locking the document. My first attempt was to just reject the second edit — but that breaks the user experience completely. Reading about OT showed me that the key insight is *transforming the position* of an operation based on what else happened concurrently, not rejecting it.

I also learned that WebSockets are inherently single-server — my first Redis-free version worked fine with one backend, but the moment I spun up a second Node.js process, clients on different instances couldn't see each other's edits. Redis Pub/Sub was the natural solution: each backend publishes incoming ops to a channel, all backends subscribe and forward to their local WebSocket clients.

The snapshot service surprised me — I expected the hard part to be OT, but it was actually the version-history reconstruction. Figuring out how to efficiently find the closest snapshot and replay only the delta took careful thought about the data model.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Quill.js, quill-cursors, React Router, Vite |
| Backend | Node.js 20, Express, ws (WebSocket), JWT |
| OT Engine | Custom JS (no external OT library) |
| Database | PostgreSQL 15 (operations, snapshots, users) |
| Pub/Sub | Redis 7 |
| Proxy | Nginx (load balancer + WS upgrade) |
| Containers | Docker, Docker Compose |
| Tests | Jest (19 OT unit tests) |
| Load test | Artillery |
