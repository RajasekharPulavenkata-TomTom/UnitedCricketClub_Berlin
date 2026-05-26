#!/bin/sh
set -e

echo "==> Seeding database (skips existing records)..."
python3 seed.py

exec uvicorn main:app --host 0.0.0.0 --port 8080
