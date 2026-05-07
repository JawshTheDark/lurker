# Caint

Self-hosted IRC client. Server holds a persistent IRC connection; a Vue web UI connects over WebSocket to view and interact with channels.

## Stack
- Express + `irc-framework` + `ws` + better-sqlite3 (server)
- Vue 3 + Vite + Pinia (client)

## Development
```
npm run install:all
cp .env.example .env   # edit SESSION_SECRET, INITIAL_USERNAME, INITIAL_PASSWORD
npm run dev
```

Vite serves the client at http://localhost:5173 and proxies `/api` and `/ws` to the Express server on `PORT` (default 8010).

## Production
```
npm install
npm run client:build
npm start
```

## Status
v0.1 — single-user, single-network, in-memory backlog. See the Vikunja "Caint" project for the post-v0.1 roadmap.
