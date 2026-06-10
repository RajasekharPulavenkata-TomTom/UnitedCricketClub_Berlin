#!/usr/bin/env python3
"""
Seed a root admin user for CI E2E tests.

Usage:
    E2E_USERNAME=ci_admin E2E_PASSWORD=ci_pass python tests/seed_ci_user.py

Must be run from the ucc-manager/ directory with DATABASE_URL set.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text
from services.auth_service import hash_password

username = os.environ["E2E_USERNAME"]
password = os.environ["E2E_PASSWORD"]

with engine.begin() as conn:
    conn.execute(
        text("""
            INSERT INTO users (username, full_name, hashed_password, role, is_active, status, created_at)
            VALUES (:u, 'CI Admin', :h, 'root', TRUE, 'active', NOW())
            ON CONFLICT (username) DO UPDATE SET
                hashed_password = EXCLUDED.hashed_password,
                role = 'root',
                is_active = TRUE,
                status = 'active'
        """),
        {"u": username, "h": hash_password(password)},
    )

print(f"Seeded CI admin user: {username}")
