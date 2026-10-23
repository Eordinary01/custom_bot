@echo off
REM Launch lightweight SearxNG meta-search container via Docker Compose
echo Starting local SearxNG search aggregator on http://localhost:8080...
docker compose up -d searxng
echo SearxNG is running in the background.
