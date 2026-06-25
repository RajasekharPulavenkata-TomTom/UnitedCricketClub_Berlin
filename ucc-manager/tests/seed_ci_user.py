#!/usr/bin/env python3
"""
Seed a developer-role admin user and a small set of active members for CI E2E tests.

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
            VALUES (:u, 'CI Admin', :h, 'developer', TRUE, 'active', NOW())
            ON CONFLICT (username) DO UPDATE SET
                hashed_password = EXCLUDED.hashed_password,
                role = 'developer',
                is_active = TRUE,
                status = 'active'
        """),
        {"u": username, "h": hash_password(password)},
    )

    # Seed a handful of active members so member-dependent E2E tests have data.
    conn.execute(
        text("""
            INSERT INTO members (name, jersey_name, role, ball_type, is_active, cricheroes, cricclubs, created_at)
            VALUES
                ('CI Player Alpha',   'Alpha',   'Batsman',     'Leather', TRUE, FALSE, FALSE, NOW()),
                ('CI Player Beta',    'Beta',    'Bowler',      'Leather', TRUE, FALSE, FALSE, NOW()),
                ('CI Player Gamma',   'Gamma',   'All-rounder', 'Both',    TRUE, FALSE, FALSE, NOW())
            ON CONFLICT (name) DO NOTHING
        """)
    )

print(f"Seeded CI admin user '{username}' and 3 active members.")
