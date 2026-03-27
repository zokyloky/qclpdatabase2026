"""
migrate_to_supabase.py
----------------------
One-time migration: copies all data from the local SQLite database
(lp_database.db) into the Supabase Postgres project.

HOW TO RUN
----------
Option A — double-click this file in Windows Explorer (simplest).
Option B — open a terminal and run:
    python migrate_to_supabase.py

The window will stay open after it finishes (or if it errors) so you
can read the output.

BEFORE YOU RUN
--------------
Install the Postgres driver once if you haven't already:
    pip install psycopg2-binary
"""

import sqlite3
import sys
import os
from pathlib import Path

# ── Connection string ────────────────────────────────────────────────────────
# Password is already filled in. sslmode=require is mandatory for Supabase.
# Two connection options — the script tries them in order.
# The pooler uses a different hostname that works even when the direct
# connection is blocked by DNS, VPNs, or corporate firewalls.
#
#   Option 1 (pooler — try this first):
#     host: aws-0-ap-northeast-1.pooler.supabase.com  port: 5432
#     user: postgres.wbyuqjvdlavvxpzspygc
#
#   Option 2 (direct — fallback):
#     host: db.wbyuqjvdlavvxpzspygc.supabase.co  port: 5432
#     user: postgres

_PASSWORD = "YOUR_SUPABASE_DB_PASSWORD"  # Fill in before running — do not commit real password

CONNECTION_OPTIONS = [
    # Pooler / session mode (different hostname, bypasses DNS issues)
    (
        f"postgresql://postgres.wbyuqjvdlavvxpzspygc:{_PASSWORD}"
        f"@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
        f"?sslmode=require"
    ),
    # Direct connection (original)
    (
        f"postgresql://postgres:{_PASSWORD}"
        f"@db.wbyuqjvdlavvxpzspygc.supabase.co:5432/postgres"
        f"?sslmode=require"
    ),
]

CONNECTION_STRING = CONNECTION_OPTIONS[0]  # updated below if first fails

# SQLite source — path is relative to THIS script file, not the working directory.
# This means you can run the script from anywhere and it will still find the DB.
SCRIPT_DIR  = Path(__file__).resolve().parent
SQLITE_PATH = SCRIPT_DIR.parent / "Phase 3 - Database Construction" / "lp_database.db"

BATCH_SIZE = 500  # rows per INSERT batch
# ────────────────────────────────────────────────────────────────────────────


def get_pg_conn():
    try:
        import psycopg2
    except ImportError:
        raise RuntimeError(
            "psycopg2 is not installed.\n\n"
            "Fix: open a terminal and run:\n"
            "    pip install psycopg2-binary\n\n"
            "Then run this script again."
        )

    import psycopg2

    labels = ["pooler (aws-0-ap-northeast-1.pooler.supabase.com)", "direct (db.wbyuqjvdlavvxpzspygc.supabase.co)"]
    last_err = None

    for i, conn_str in enumerate(CONNECTION_OPTIONS):
        print(f"  Trying {labels[i]} ...", end=" ", flush=True)
        try:
            conn = psycopg2.connect(conn_str, connect_timeout=10)
            conn.autocommit = False
            print("OK")
            return conn
        except Exception as e:
            print(f"FAILED\n    ({e})")
            last_err = e

    raise RuntimeError(
        f"Could not connect to Supabase via either endpoint.\n\n"
        f"Last error: {last_err}\n\n"
        f"Things to try:\n"
        f"  1. Make sure you are connected to the internet.\n"
        f"  2. Temporarily disable any VPN.\n"
        f"  3. Check that port 5432 is not blocked by your firewall.\n"
        f"  4. In the Supabase dashboard go to Settings → Database and\n"
        f"     confirm your password is correct."
    )


def migrate_table(sqlite_conn, pg_conn, table, batch_size=BATCH_SIZE):
    import psycopg2
    cur_sq = sqlite_conn.cursor()
    cur_sq.execute(f"SELECT * FROM {table}")
    rows = cur_sq.fetchall()
    cols = [d[0] for d in cur_sq.description]

    if not rows:
        print(f"  {table}: 0 rows — skipping.")
        return 0

    col_list    = ", ".join(cols)
    placeholders = ", ".join(["%s"] * len(cols))
    sql = (
        f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) "
        f"ON CONFLICT (id) DO NOTHING"
    )

    cur_pg   = pg_conn.cursor()
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        cur_pg.executemany(sql, batch)
        pg_conn.commit()
        inserted += len(batch)
        pct = int(inserted / len(rows) * 100)
        print(f"    {inserted:,} / {len(rows):,}  ({pct}%)", end="\r")

    print(f"    {inserted:,} rows inserted.          ")
    return inserted


def validate(pg_conn):
    cur = pg_conn.cursor()
    tables = ["lp_firms", "lp_contacts", "outreach_log", "sync_log"]
    print("\nValidation (row counts in Supabase):")
    all_ok = True
    expected = {"lp_firms": 3664, "lp_contacts": 31330, "sync_log": 1}
    for t in tables:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        count = cur.fetchone()[0]
        exp   = expected.get(t)
        mark  = ""
        if exp is not None:
            mark = "  ✓" if count >= exp else f"  ✗  (expected {exp})"
            if count < exp:
                all_ok = False
        print(f"  {t:<22} {count:>6,}{mark}")
    return all_ok


def main():
    print("=" * 55)
    print("  LP Contact Intelligence — Supabase Migration")
    print("=" * 55)

    # 1. Check SQLite file exists
    print(f"\nLooking for SQLite database at:\n  {SQLITE_PATH}")
    if not SQLITE_PATH.exists():
        raise FileNotFoundError(
            f"SQLite file not found at:\n  {SQLITE_PATH}\n\n"
            "Make sure this script is inside the 'Phase 5 - Web Application' folder\n"
            "and that 'Phase 3 - Database Construction/lp_database.db' exists\n"
            "one level up from it."
        )
    print(f"  Found ({SQLITE_PATH.stat().st_size / 1_000_000:.1f} MB)")

    # 2. Connect to Supabase (tries pooler first, direct connection as fallback)
    print("Connecting to Supabase ...")
    pg_conn = get_pg_conn()
    print()

    sq_conn = sqlite3.connect(str(SQLITE_PATH))

    # 3. Migrate in FK order
    steps = [
        ("lp_firms",    "[1/3] Migrating lp_firms    ..."),
        ("lp_contacts", "[2/3] Migrating lp_contacts ..."),
        ("sync_log",    "[3/3] Migrating sync_log    ..."),
    ]

    for table, label in steps:
        print(label)
        migrate_table(sq_conn, pg_conn, table)

    # 4. Validate
    ok = validate(pg_conn)

    sq_conn.close()
    pg_conn.close()

    print()
    if ok:
        print("Migration complete. All row counts match.")
    else:
        print("Migration finished but some counts look low — safe to re-run.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("\n" + "=" * 55)
        print("  ERROR")
        print("=" * 55)
        print(f"\n{e}\n")
    finally:
        # Keep the window open so you can read the output
        input("\nPress Enter to close this window...")
