# Telgrarr

Telgrarr is a mobile-first webhook-driven notification system for Sonarr and Radarr.

## Production Architecture

Telgrarr runs as a single unified production runtime:

- One PM2 app running the Node.js backend
- Express serves both the REST API and the built React GUI
- Frontend SPA routes are served through the backend
- `/api/*` routes always take precedence over frontend routes

## Features

- Sonarr and Radarr webhook ingestion
- Queue batching and Telegram dispatch
- React GUI for Dashboard, Settings, Preview, Logs, Blacklist, and About
- Persistent config, templates, sessions, history, and blacklist
- Live SSE event feed
- Structured app, error, and audit logging
- Backup and restore system
- Emby library refresh integration

## Project Structure

src/      Backend (routes, services, orchestration)
gui/      React frontend (source + production build)
data/     Persistent runtime data
logs/     app.log, error.log, audit.log
backups/  Backup archives
scripts/  Recovery and utility scripts

## Start

pm2 start ecosystem.config.js

## Development

cd gui
npm install
npm run dev

## Recovery

npm run recover

## Local Reference

Telgrarr-Master-Architecture.txt

## Notes

This repository does not assume a specific domain, tunnel, or hosting provider.
Instance-specific deployment details should be configured by each operator.

