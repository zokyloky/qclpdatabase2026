"""
main.py — LP Contact Intelligence System
FastAPI backend for the Phase 5 web application.

Serves the React SPA from /static/ and exposes the API under /api/.
Auth: shared password → JWT (no user accounts needed).
"""

import os, io, csv, json, uuid, yaml
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pathlib import Path

import psycopg2
import psycopg2.extras
from fastapi import (
    FastAPI, HTTPException, Depends, status, UploadFile, File,
    Query, BackgroundTasks
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import jwt, JWTError
from dotenv import load_dotenv

import pandas as pd
from rapidfuzz import fuzz

load_dotenv()

# ── Configuration ────────────────────────────────────────────────────────────
APP_PASSWORD  = os.environ.get("APP_PASSWORD", "changeme")
SECRET_KEY    = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
DATABASE_URL  = os.environ.get("DATABASE_URL", "")
ALGORITHM     = "HS256"
TOKEN_EXPIRE_DAYS = 30
OVERDUE_DAYS  = int(os.environ.get("OVERDUE_DAYS", "180"))
STATIC_DIR    = Path(__file__).parent / "static"

# ── App setup ────────────────────────────────────────────────────────────────
app = FastAPI(title="LP Contact Intelligence System", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


# ── Database ─────────────────────────────────────────────────────────────────
def get_db():
    if not DATABASE_URL:
        raise HTTPException(500, "DATABASE_URL environment variable not set")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        yield conn
    finally:
        conn.close()


def dict_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ── Auth ──────────────────────────────────────────────────────────────────────
def create_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"exp": expire, "sub": "user"}, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")


class LoginRequest(BaseModel):
    password: str


@app.post("/api/auth/login")
def login(req: LoginRequest):
    if req.password != APP_PASSWORD:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    return {"token": create_token(), "expires_in_days": TOKEN_EXPIRE_DAYS}


# ── Helpers ───────────────────────────────────────────────────────────────────
VALID_WORKFLOW_STATUSES = ("unreviewed", "in_progress", "complete", "needs_attention")

# Status priority for default sort: needs_attention first, then unreviewed,
# in_progress, complete, and no-contact firms last.
WORKFLOW_SORT_PRIORITY = """
CASE f.workflow_status
    WHEN 'needs_attention' THEN 1
    WHEN 'unreviewed'      THEN 2
    WHEN 'in_progress'     THEN 3
    WHEN 'complete'        THEN 4
    ELSE 5
END
"""


# ── Firms list ────────────────────────────────────────────────────────────────
@app.get("/api/firms", dependencies=[Depends(verify_token)])
def list_firms(
    search:           Optional[str]  = Query(None),
    source:           Optional[str]  = Query(None),
    institution_type: Optional[str]  = Query(None),
    region:           Optional[str]  = Query(None),
    country:          Optional[str]  = Query(None),
    city:             Optional[str]  = Query(None),
    investor_status:  Optional[str]  = Query(None),
    workflow_status:  Optional[str]  = Query(None),
    page:             int            = Query(1, ge=1),
    per_page:         int            = Query(50, ge=1, le=200),
    sort_by:          str            = Query("workflow_priority"),
    sort_dir:         str            = Query("asc"),
    db = Depends(get_db),
):
    where_clauses = ["f.is_active = 1"]
    params: List = []

    if search:
        where_clauses.append("(f.lp_name ILIKE %s OR f.display_name ILIKE %s)")
        q = f"%{search}%"
        params += [q, q]

    if source:
        where_clauses.append("f.source = %s")
        params.append(source)

    if institution_type:
        where_clauses.append("f.institution_type = %s")
        params.append(institution_type)

    if region:
        where_clauses.append("f.region = %s")
        params.append(region)

    if country:
        where_clauses.append("f.country = %s")
        params.append(country)

    if city:
        where_clauses.append("f.city ILIKE %s")
        params.append(city)

    if investor_status:
        where_clauses.append("f.investor_status = %s")
        params.append(investor_status)

    if workflow_status:
        if workflow_status == "no_contacts":
            # Derived state: firms with zero available contacts
            where_clauses.append(
                "COALESCE(cs.approved_count, 0) + COALESCE(cs.dynamo_count, 0) = 0"
            )
        elif workflow_status in VALID_WORKFLOW_STATUSES:
            where_clauses.append("f.workflow_status = %s")
            params.append(workflow_status)

    where_sql = "WHERE " + " AND ".join(where_clauses)

    # Allowed sort columns — workflow_priority uses the CASE expression
    sort_col_map = {
        "workflow_priority": WORKFLOW_SORT_PRIORITY,
        "lp_name":           "f.lp_name",
        "selected_count":    "selected_count",
        "available_count":   "available_count",
        "last_outreach":     "os.last_outreach_date",
        "institution_type":  "f.institution_type",
        "country":           "f.country",
        "workflow_status":   "f.workflow_status",
    }
    sort_col = sort_col_map.get(sort_by, WORKFLOW_SORT_PRIORITY)
    sort_dir_sql = "DESC" if sort_dir.lower() == "desc" else "ASC"

    base = f"""
    WITH firm_stats AS (
        SELECT
            lp_firm_id,
            COUNT(*) FILTER (WHERE filter_status = 'approved'       AND is_active = 1) AS approved_count,
            COUNT(*) FILTER (WHERE filter_status = 'dynamo'         AND is_active = 1) AS dynamo_count,
            COUNT(*) FILTER (WHERE filter_status = 'pending_review' AND is_active = 1) AS pending_count,
            COUNT(*) FILTER (WHERE is_selected = 1                  AND is_active = 1) AS selected_count
        FROM lp_contacts GROUP BY lp_firm_id
    ),
    outreach_stats AS (
        SELECT lp_firm_id, MAX(outreach_date) AS last_outreach_date
        FROM outreach_log GROUP BY lp_firm_id
    )
    SELECT
        f.id, f.lp_name, f.display_name, f.institution_type,
        f.country, f.city, f.region, f.source, f.investor_status, f.aum_usd_mn,
        f.workflow_status, f.workflow_completed_at, f.review_reason,
        COALESCE(cs.approved_count, 0)                                        AS approved_count,
        COALESCE(cs.dynamo_count,   0)                                        AS dynamo_count,
        COALESCE(cs.pending_count,  0)                                        AS pending_count,
        COALESCE(cs.selected_count, 0)                                        AS selected_count,
        COALESCE(cs.approved_count, 0) + COALESCE(cs.dynamo_count, 0)        AS available_count,
        os.last_outreach_date
    FROM lp_firms f
    LEFT JOIN firm_stats cs     ON cs.lp_firm_id = f.id
    LEFT JOIN outreach_stats os ON os.lp_firm_id = f.id
    {where_sql}
    """

    with dict_cursor(db) as cur:
        cur.execute(f"SELECT COUNT(*) AS total FROM ({base}) sub", params)
        total = cur.fetchone()["total"]

    # Default sort: workflow priority, then alphabetical within group
    if sort_col == WORKFLOW_SORT_PRIORITY:
        order_clause = f"ORDER BY {sort_col} ASC, f.lp_name ASC NULLS LAST"
    else:
        order_clause = f"ORDER BY {sort_col} {sort_dir_sql} NULLS LAST"

    data_sql = base + f" {order_clause} LIMIT %s OFFSET %s"
    with dict_cursor(db) as cur:
        cur.execute(data_sql, params + [per_page, (page - 1) * per_page])
        rows = [dict(r) for r in cur.fetchall()]

    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    max(1, (total + per_page - 1) // per_page),
        "firms":    rows,
    }


# ── Firm detail ───────────────────────────────────────────────────────────────
@app.get("/api/firms/{firm_id}", dependencies=[Depends(verify_token)])
def get_firm(firm_id: str, db=Depends(get_db)):
    with dict_cursor(db) as cur:
        cur.execute(
            """
            SELECT f.*,
                COUNT(c.id) FILTER (WHERE c.filter_status IN ('approved','dynamo') AND c.is_active = 1) AS available_count,
                COUNT(c.id) FILTER (WHERE c.is_selected = 1 AND c.is_active = 1)                        AS selected_count,
                COUNT(c.id) FILTER (WHERE c.filter_status = 'pending_review' AND c.is_active = 1)       AS pending_count
            FROM lp_firms f
            LEFT JOIN lp_contacts c ON c.lp_firm_id = f.id
            WHERE f.id = %s AND f.is_active = 1
            GROUP BY f.id
            """,
            (firm_id,),
        )
        firm = cur.fetchone()
    if not firm:
        raise HTTPException(404, "Firm not found")
    return dict(firm)


# ── Contacts for a firm ───────────────────────────────────────────────────────
@app.get("/api/firms/{firm_id}/contacts", dependencies=[Depends(verify_token)])
def get_firm_contacts(firm_id: str, db=Depends(get_db)):
    with dict_cursor(db) as cur:
        cur.execute(
            """
            SELECT id, first_name, last_name, email, job_title, role_tags,
                   linkedin_url, source, filter_status, filter_score,
                   is_selected, is_active, preqin_removed, qa_flags, updated_at
            FROM lp_contacts
            WHERE lp_firm_id = %s AND is_active = 1
            ORDER BY
                CASE filter_status
                    WHEN 'dynamo'         THEN 1
                    WHEN 'approved'       THEN 2
                    WHEN 'pending_review' THEN 3
                    WHEN 'blacklisted'    THEN 4
                    ELSE 5
                END,
                COALESCE(filter_score, 0) DESC,
                last_name
            """,
            (firm_id,),
        )
        contacts = [dict(r) for r in cur.fetchall()]
    return contacts


# ── Update a contact ──────────────────────────────────────────────────────────
class ContactUpdate(BaseModel):
    is_selected:   Optional[int]  = None
    filter_status: Optional[str]  = None


@app.patch("/api/contacts/{contact_id}", dependencies=[Depends(verify_token)])
def update_contact(contact_id: str, update: ContactUpdate, db=Depends(get_db)):
    fields, params = [], []
    now = datetime.now(timezone.utc).isoformat()

    if update.is_selected is not None:
        fields.append("is_selected = %s")
        params.append(update.is_selected)

    if update.filter_status is not None:
        allowed = ("approved", "blacklisted", "pending_review", "dynamo")
        if update.filter_status not in allowed:
            raise HTTPException(400, f"filter_status must be one of {allowed}")
        fields.append("filter_status = %s")
        params.append(update.filter_status)

    if not fields:
        raise HTTPException(400, "Nothing to update")

    fields.append("updated_at = %s")
    params.append(now)
    params.append(contact_id)

    sql = f"UPDATE lp_contacts SET {', '.join(fields)} WHERE id = %s RETURNING id, lp_firm_id"
    with dict_cursor(db) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Contact not found")

        # Auto-advance firm to in_progress when user makes their first selection
        if update.is_selected == 1:
            cur.execute(
                """
                UPDATE lp_firms
                SET workflow_status = 'in_progress', updated_at = %s
                WHERE id = %s AND workflow_status = 'unreviewed'
                """,
                (now, row["lp_firm_id"]),
            )

        db.commit()
    return {"id": contact_id, "updated": True}


# ── Pending review queue ──────────────────────────────────────────────────────
@app.get("/api/review/pending", dependencies=[Depends(verify_token)])
def pending_review(
    page: int     = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
):
    offset = (page - 1) * per_page
    with dict_cursor(db) as cur:
        cur.execute(
            "SELECT COUNT(*) AS total FROM lp_contacts WHERE filter_status = 'pending_review' AND is_active = 1"
        )
        total = cur.fetchone()["total"]

        cur.execute(
            """
            SELECT c.id, c.first_name, c.last_name, c.job_title, c.role_tags,
                   c.email, c.linkedin_url, c.qa_flags, c.lp_firm_id, c.updated_at,
                   f.lp_name, f.display_name, f.institution_type, f.country
            FROM lp_contacts c
            JOIN lp_firms f ON f.id = c.lp_firm_id
            WHERE c.filter_status = 'pending_review' AND c.is_active = 1
            ORDER BY f.lp_name, c.last_name
            LIMIT %s OFFSET %s
            """,
            (per_page, offset),
        )
        contacts = [dict(r) for r in cur.fetchall()]
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "contacts": contacts,
    }


# ── Outreach log ──────────────────────────────────────────────────────────────
@app.get("/api/outreach", dependencies=[Depends(verify_token)])
def list_outreach(
    firm_id:  Optional[str] = Query(None),
    page:     int           = Query(1, ge=1),
    per_page: int           = Query(50, ge=1, le=200),
    db=Depends(get_db),
):
    where = ["1=1"]
    params = []
    if firm_id:
        where.append("o.lp_firm_id = %s")
        params.append(firm_id)

    where_sql = " AND ".join(where)
    with dict_cursor(db) as cur:
        cur.execute(
            f"SELECT COUNT(*) AS total FROM outreach_log o WHERE {where_sql}", params
        )
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT o.*, f.lp_name, f.display_name,
                   c.first_name || ' ' || c.last_name AS contact_name,
                   c.job_title AS contact_title
            FROM outreach_log o
            JOIN lp_firms f ON f.id = o.lp_firm_id
            LEFT JOIN lp_contacts c ON c.id = o.lp_contact_id
            WHERE {where_sql}
            ORDER BY o.outreach_date DESC NULLS LAST, o.created_at DESC
            LIMIT %s OFFSET %s
            """,
            params + [per_page, (page - 1) * per_page],
        )
        rows = [dict(r) for r in cur.fetchall()]

    return {"total": total, "page": page, "per_page": per_page, "entries": rows}


class OutreachEntry(BaseModel):
    lp_firm_id:    str
    lp_contact_id: Optional[str] = None
    outreach_date: Optional[str] = None
    outreach_type: Optional[str] = None
    notes:         Optional[str] = None
    logged_by:     Optional[str] = None


@app.post("/api/outreach", dependencies=[Depends(verify_token)])
def create_outreach(entry: OutreachEntry, db=Depends(get_db)):
    allowed_types = ("email", "call", "meeting", "event", None)
    if entry.outreach_type not in allowed_types:
        raise HTTPException(400, "outreach_type must be email/call/meeting/event")
    row_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with dict_cursor(db) as cur:
        cur.execute(
            """
            INSERT INTO outreach_log
                (id, lp_firm_id, lp_contact_id, outreach_date, outreach_type,
                 notes, logged_by, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                row_id, entry.lp_firm_id, entry.lp_contact_id,
                entry.outreach_date, entry.outreach_type,
                entry.notes, entry.logged_by, now,
            ),
        )
        db.commit()
    return {"id": row_id}


@app.delete("/api/outreach/{entry_id}", dependencies=[Depends(verify_token)])
def delete_outreach(entry_id: str, db=Depends(get_db)):
    with dict_cursor(db) as cur:
        cur.execute("DELETE FROM outreach_log WHERE id = %s", (entry_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Entry not found")
        db.commit()
    return {"deleted": True}


# ── Export ────────────────────────────────────────────────────────────────────
@app.get("/api/export/contacts", dependencies=[Depends(verify_token)])
def export_selected_contacts(db=Depends(get_db)):
    """Download all is_selected=1 contacts as CSV."""
    with dict_cursor(db) as cur:
        cur.execute(
            """
            SELECT
                f.display_name  AS firm_name,
                f.institution_type,
                f.country,
                f.region,
                f.investor_status,
                f.source        AS firm_source,
                c.first_name,
                c.last_name,
                c.job_title,
                c.email,
                c.linkedin_url,
                c.filter_score,
                c.role_tags,
                c.source        AS contact_source
            FROM lp_contacts c
            JOIN lp_firms f ON f.id = c.lp_firm_id
            WHERE c.is_selected = 1 AND c.is_active = 1 AND f.is_active = 1
            ORDER BY f.display_name, COALESCE(c.filter_score, 0) DESC
            """
        )
        rows = cur.fetchall()

    if not rows:
        raise HTTPException(404, "No selected contacts found")

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    for r in rows:
        writer.writerow(dict(r))

    output.seek(0)
    filename = f"selected_contacts_{datetime.now().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/contacts/selected", dependencies=[Depends(verify_token)])
def get_selected_contacts(db=Depends(get_db)):
    """Return all is_selected=1 contacts as JSON (for the Selected Contacts page)."""
    with dict_cursor(db) as cur:
        cur.execute(
            """
            SELECT
                c.id,
                c.lp_firm_id,
                f.display_name  AS firm_name,
                f.institution_type,
                f.country,
                c.first_name,
                c.last_name,
                c.job_title,
                c.email,
                c.linkedin_url,
                c.filter_score,
                c.role_tags,
                c.source        AS contact_source
            FROM lp_contacts c
            JOIN lp_firms f ON f.id = c.lp_firm_id
            WHERE c.is_selected = 1 AND c.is_active = 1 AND f.is_active = 1
            ORDER BY f.display_name, COALESCE(c.filter_score, 0) DESC
            """
        )
        rows = cur.fetchall()
    return [dict(r) for r in rows]


# ── Filter config helpers (for sync) ─────────────────────────────────────────
FILTER_CONFIG_PATH = Path(__file__).parent / "filter_config.yaml"

DEFAULT_FILTER_CONFIG = {
    "role_rules": {
        "permitted_combinations": [
            ["Investment Team"],
            ["Investment Team", "Portfolio Management"],
        ]
    },
    "title_blacklist": [
        "analyst", "secondar", "accounting", "accountant", "operations",
        "operational", "compliance", "legal", "administrator", "admin",
        "assistant", "coordinator", "intern",
    ],
    "title_whitelist": [
        "managing director", "partner", "chief investment officer", "cio",
        "head of", "director", "portfolio manager", "senior portfolio",
        "principal", "vice president", "vp",
    ],
    "scoring": {
        "base_score": 50,
        "whitelist_match_bonus": 30,
        "investment_team_role_bonus": 15,
        "no_contact_info_penalty": 20,
        "seniority_keywords": {
            "chief investment officer": 30, "cio": 30,
            "managing director": 25, "partner": 25,
            "head of": 20, "director": 15, "principal": 15,
            "vice president": 10, "vp": 10, "senior": 5,
        },
    },
    "per_firm_caps": {"cap_both_firms": 5, "cap_preqin_only_firms": 10},
}


def load_filter_config():
    if FILTER_CONFIG_PATH.exists():
        with open(FILTER_CONFIG_PATH) as f:
            return yaml.safe_load(f)
    return DEFAULT_FILTER_CONFIG


def compute_filter(job_title: str, role_tags_str: str, email: str, linkedin: str, cfg: dict):
    """Replicate Phase 4 filter_engine logic. Returns (filter_status, filter_score)."""
    title = (job_title or "").lower()
    tags_raw = [t.strip() for t in (role_tags_str or "").split("|") if t.strip()]
    tags_set = frozenset(t.lower() for t in tags_raw)

    permitted = [
        frozenset(c.lower() for c in combo)
        for combo in cfg["role_rules"]["permitted_combinations"]
    ]

    # Layer 1: role filter
    if not tags_set:
        return "pending_review", None
    if tags_set not in permitted:
        return "blacklisted", None

    # Layer 2: title blacklist
    for term in cfg["title_blacklist"]:
        if term in title:
            return "blacklisted", None

    # Layer 3: scoring
    score = cfg["scoring"]["base_score"]
    whitelist = cfg["title_whitelist"]
    for term in whitelist:
        if term in title:
            score += cfg["scoring"]["whitelist_match_bonus"]
            break

    seniority = sorted(
        cfg["scoring"]["seniority_keywords"].items(), key=lambda x: -x[1]
    )
    for kw, bonus in seniority:
        if kw in title:
            score += bonus
            break

    score += cfg["scoring"]["investment_team_role_bonus"]

    if not email and not linkedin:
        score -= cfg["scoring"]["no_contact_info_penalty"]

    return "approved", max(0, min(score, 100))


# ── Sync — in-app Preqin upload ───────────────────────────────────────────────
# Pending diffs are held in memory keyed by session_id.
# For a single-user tool this is fine; note that a Render restart clears them.
_pending_diffs: dict = {}


def parse_preqin_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Parse Preqin contacts export (xlsx or csv)."""
    buf = io.BytesIO(file_bytes)
    if filename.lower().endswith(".xlsx"):
        df = pd.read_excel(buf, dtype=str)
    else:
        df = pd.read_csv(buf, dtype=str)
    df.columns = [c.strip().upper() for c in df.columns]
    df = df.fillna("")
    return df


def normalise_preqin_df(df: pd.DataFrame) -> pd.DataFrame:
    """Map Preqin export columns to internal names."""
    col_map = {
        "CONTACT_ID":  "preqin_contact_id",
        "NAME":        "full_name",
        "EMAIL":       "email",
        "JOB TITLE":   "job_title",
        "ROLE":        "role_tags",
        "LINKEDIN":    "linkedin_url",
        "FIRM_ID":     "preqin_firm_id",
        "FIRM NAME":   "firm_name",
    }
    # Only keep columns we know about
    existing = {k: v for k, v in col_map.items() if k in df.columns}
    df = df.rename(columns=existing)[list(existing.values())]
    return df


@app.post("/api/sync/upload", dependencies=[Depends(verify_token)])
async def sync_upload(file: UploadFile = File(...), db=Depends(get_db)):
    """
    Upload a new Preqin contacts export. Returns a diff preview.
    Does NOT commit any changes — call /api/sync/commit to apply.
    """
    file_bytes = await file.read()
    try:
        raw_df = parse_preqin_file(file_bytes, file.filename)
        df = normalise_preqin_df(raw_df)
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")

    if "preqin_contact_id" not in df.columns or "preqin_firm_id" not in df.columns:
        raise HTTPException(
            400,
            "Could not find required columns (CONTACT_ID, FIRM_ID). "
            "Please upload the Preqin contacts export file."
        )

    # Pull existing data from DB
    with dict_cursor(db) as cur:
        cur.execute("SELECT id, preqin_contact_id, job_title, role_tags, lp_firm_id, is_active FROM lp_contacts WHERE source = 'preqin'")
        existing_contacts = {r["preqin_contact_id"]: dict(r) for r in cur.fetchall()}

        cur.execute("SELECT id, preqin_firm_id FROM lp_firms WHERE preqin_firm_id IS NOT NULL")
        existing_firms = {r["preqin_firm_id"]: r["id"] for r in cur.fetchall()}

    new_contacts, updated_contacts, unchanged, unknown_firms = [], [], [], set()

    cfg = load_filter_config()

    for _, row in df.iterrows():
        cid = str(row.get("preqin_contact_id", "")).strip()
        fid = str(row.get("preqin_firm_id",  "")).strip()

        if not cid:
            continue

        if fid not in existing_firms:
            unknown_firms.add(fid)
            continue

        if cid not in existing_contacts:
            # New contact
            filter_status, filter_score = compute_filter(
                row.get("job_title", ""),
                row.get("role_tags",  ""),
                row.get("email", ""),
                row.get("linkedin_url", ""),
                cfg,
            )
            new_contacts.append({
                "preqin_contact_id": cid,
                "preqin_firm_id":    fid,
                "lp_firm_id":        existing_firms[fid],
                "full_name":         row.get("full_name", ""),
                "email":             row.get("email", ""),
                "job_title":         row.get("job_title", ""),
                "role_tags":         row.get("role_tags", ""),
                "linkedin_url":      row.get("linkedin_url", ""),
                "filter_status":     filter_status,
                "filter_score":      filter_score,
            })
        else:
            existing = existing_contacts[cid]
            old_title = (existing.get("job_title") or "").strip()
            new_title = str(row.get("job_title", "")).strip()
            old_role  = (existing.get("role_tags") or "").strip()
            new_role  = str(row.get("role_tags", "")).strip()

            if old_title != new_title or old_role != new_role:
                filter_status, filter_score = compute_filter(
                    new_title, new_role,
                    row.get("email", ""), row.get("linkedin_url", ""),
                    cfg,
                )
                updated_contacts.append({
                    "id":              existing["id"],
                    "preqin_contact_id": cid,
                    "old_job_title":   old_title,
                    "new_job_title":   new_title,
                    "old_role_tags":   old_role,
                    "new_role_tags":   new_role,
                    "new_filter_status": filter_status,
                    "new_filter_score":  filter_score,
                })
            else:
                unchanged.append(cid)

    # Contacts in DB but not in new export → flag for deactivation
    new_cids = set(str(r.get("preqin_contact_id", "")).strip() for _, r in df.iterrows())
    removed_contacts = [
        {"id": v["id"], "preqin_contact_id": k}
        for k, v in existing_contacts.items()
        if k not in new_cids and v["is_active"] == 1
    ]

    session_id = str(uuid.uuid4())
    _pending_diffs[session_id] = {
        "filename":          file.filename,
        "new_contacts":      new_contacts,
        "updated_contacts":  updated_contacts,
        "removed_contacts":  removed_contacts,
        "unknown_firm_ids":  list(unknown_firms),
    }

    return {
        "session_id":           session_id,
        "filename":             file.filename,
        "new_contacts":         len(new_contacts),
        "updated_contacts":     len(updated_contacts),
        "unchanged_contacts":   len(unchanged),
        "removed_contacts":     len(removed_contacts),
        "unknown_firm_ids":     len(unknown_firms),
        "new_contacts_preview":    new_contacts[:20],
        "updated_contacts_preview": updated_contacts[:20],
        "removed_contacts_preview": removed_contacts[:20],
    }


@app.post("/api/sync/commit/{session_id}", dependencies=[Depends(verify_token)])
def sync_commit(session_id: str, db=Depends(get_db)):
    """Apply the pending diff from a previous /api/sync/upload call."""
    diff = _pending_diffs.pop(session_id, None)
    if not diff:
        raise HTTPException(404, "Session not found or already committed. Please re-upload.")

    now = datetime.now(timezone.utc).isoformat()
    stats = {"added": 0, "updated": 0, "deactivated": 0}

    with dict_cursor(db) as cur:
        # Insert new contacts
        for c in diff["new_contacts"]:
            parts = c["full_name"].split(" ", 1)
            first = parts[0] if parts else ""
            last  = parts[1] if len(parts) > 1 else ""
            cur.execute(
                """
                INSERT INTO lp_contacts
                    (id, lp_firm_id, preqin_contact_id, first_name, last_name,
                     email, job_title, role_tags, linkedin_url, source,
                     filter_status, filter_score, is_active, preqin_removed,
                     created_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'preqin',%s,%s,1,0,%s,%s)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    str(uuid.uuid4()), c["lp_firm_id"], c["preqin_contact_id"],
                    first, last, c["email"], c["job_title"], c["role_tags"],
                    c["linkedin_url"], c["filter_status"], c["filter_score"],
                    now, now,
                ),
            )
            stats["added"] += cur.rowcount

        # Update changed contacts
        for c in diff["updated_contacts"]:
            cur.execute(
                """
                UPDATE lp_contacts
                SET job_title = %s, role_tags = %s,
                    filter_status = %s, filter_score = %s, updated_at = %s
                WHERE id = %s
                """,
                (c["new_job_title"], c["new_role_tags"],
                 c["new_filter_status"], c["new_filter_score"],
                 now, c["id"]),
            )
            stats["updated"] += 1

        # Deactivate removed contacts (soft delete)
        for c in diff["removed_contacts"]:
            cur.execute(
                "UPDATE lp_contacts SET is_active = 0, preqin_removed = 1, updated_at = %s WHERE id = %s",
                (now, c["id"]),
            )
            stats["deactivated"] += 1

        # Write sync_log entry
        log_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO sync_log
                (id, sync_date, preqin_export_filename, contacts_added,
                 contacts_updated, contacts_removed, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                log_id, now, diff["filename"],
                stats["added"], stats["updated"], stats["deactivated"],
                f"In-app sync. Unknown firm IDs: {len(diff['unknown_firm_ids'])}",
            ),
        )
        db.commit()

    return {
        "committed": True,
        "contacts_added":      stats["added"],
        "contacts_updated":    stats["updated"],
        "contacts_deactivated": stats["deactivated"],
        "sync_log_id":         log_id,
    }


@app.get("/api/sync/history", dependencies=[Depends(verify_token)])
def sync_history(db=Depends(get_db)):
    with dict_cursor(db) as cur:
        cur.execute("SELECT * FROM sync_log ORDER BY sync_date DESC LIMIT 50")
        return [dict(r) for r in cur.fetchall()]


# ── Filter config view/edit ───────────────────────────────────────────────────
@app.get("/api/config/filters", dependencies=[Depends(verify_token)])
def get_filter_config():
    return load_filter_config()


# ── Firm display_name edit ────────────────────────────────────────────────────
class FirmUpdate(BaseModel):
    display_name: Optional[str] = None
    entity_type:  Optional[str] = None
    investor_status: Optional[str] = None


@app.patch("/api/firms/{firm_id}", dependencies=[Depends(verify_token)])
def update_firm(firm_id: str, update: FirmUpdate, db=Depends(get_db)):
    fields, params = [], []
    now = datetime.now(timezone.utc).isoformat()

    if update.display_name is not None:
        fields.append("display_name = %s"); params.append(update.display_name)
    if update.entity_type is not None:
        fields.append("entity_type = %s"); params.append(update.entity_type)
    if update.investor_status is not None:
        fields.append("investor_status = %s"); params.append(update.investor_status)

    if not fields:
        raise HTTPException(400, "Nothing to update")

    fields.append("updated_at = %s"); params.append(now)
    params.append(firm_id)

    with dict_cursor(db) as cur:
        cur.execute(
            f"UPDATE lp_firms SET {', '.join(fields)} WHERE id = %s RETURNING id",
            params,
        )
        if not cur.fetchone():
            raise HTTPException(404, "Firm not found")
        db.commit()
    return {"updated": True}


# ── Firm workflow status ───────────────────────────────────────────────────────
class FirmStatusUpdate(BaseModel):
    workflow_status: str
    review_reason:   Optional[str] = None


@app.patch("/api/firms/{firm_id}/status", dependencies=[Depends(verify_token)])
def update_firm_status(firm_id: str, update: FirmStatusUpdate, db=Depends(get_db)):
    if update.workflow_status not in VALID_WORKFLOW_STATUSES:
        raise HTTPException(400, f"workflow_status must be one of {VALID_WORKFLOW_STATUSES}")

    now = datetime.now(timezone.utc).isoformat()

    # Set completed_at only when transitioning to 'complete'; clear it on reopen
    if update.workflow_status == "complete":
        completed_at_sql = "workflow_completed_at = %s,"
        completed_at_val = now
    else:
        completed_at_sql = "workflow_completed_at = NULL,"
        completed_at_val = None

    with dict_cursor(db) as cur:
        if completed_at_val is not None:
            cur.execute(
                f"""
                UPDATE lp_firms
                SET workflow_status = %s,
                    {completed_at_sql}
                    review_reason   = %s,
                    updated_at      = %s
                WHERE id = %s AND is_active = 1
                RETURNING id
                """,
                (update.workflow_status, completed_at_val,
                 update.review_reason, now, firm_id),
            )
        else:
            cur.execute(
                f"""
                UPDATE lp_firms
                SET workflow_status = %s,
                    {completed_at_sql}
                    review_reason   = %s,
                    updated_at      = %s
                WHERE id = %s AND is_active = 1
                RETURNING id
                """,
                (update.workflow_status,
                 update.review_reason, now, firm_id),
            )
        if not cur.fetchone():
            raise HTTPException(404, "Firm not found")
        db.commit()
    return {"id": firm_id, "workflow_status": update.workflow_status}


# ── Global settings ────────────────────────────────────────────────────────────
@app.get("/api/settings", dependencies=[Depends(verify_token)])
def get_settings(db=Depends(get_db)):
    with dict_cursor(db) as cur:
        cur.execute("SELECT key, value FROM global_settings")
        return {r["key"]: r["value"] for r in cur.fetchall()}


class SettingsUpdate(BaseModel):
    max_contacts_per_firm: Optional[int] = None


@app.patch("/api/settings", dependencies=[Depends(verify_token)])
def update_settings(update: SettingsUpdate, db=Depends(get_db)):
    if update.max_contacts_per_firm is not None:
        if update.max_contacts_per_firm < 1:
            raise HTTPException(400, "max_contacts_per_firm must be at least 1")
        with dict_cursor(db) as cur:
            cur.execute(
                "INSERT INTO global_settings (key, value) VALUES ('max_contacts_per_firm', %s) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                (str(update.max_contacts_per_firm),),
            )
            db.commit()
    return {"updated": True}


# ── Dropdown options ──────────────────────────────────────────────────────────
@app.get("/api/options", dependencies=[Depends(verify_token)])
def get_options(db=Depends(get_db)):
    """Return distinct values for filter dropdowns."""
    with dict_cursor(db) as cur:
        cur.execute("SELECT DISTINCT institution_type FROM lp_firms WHERE institution_type IS NOT NULL ORDER BY institution_type")
        inst_types = [r["institution_type"] for r in cur.fetchall()]

        cur.execute("SELECT DISTINCT region FROM lp_firms WHERE region IS NOT NULL ORDER BY region")
        regions = [r["region"] for r in cur.fetchall()]

        cur.execute("SELECT DISTINCT country FROM lp_firms WHERE country IS NOT NULL ORDER BY country")
        countries = [r["country"] for r in cur.fetchall()]

        cur.execute("SELECT DISTINCT city FROM lp_firms WHERE city IS NOT NULL AND city != '' ORDER BY city")
        cities = [r["city"] for r in cur.fetchall()]

        # Build a region → [countries] mapping for cascading geography filter
        cur.execute("""
            SELECT DISTINCT region, country FROM lp_firms
            WHERE region IS NOT NULL AND country IS NOT NULL
            ORDER BY region, country
        """)
        country_by_region: dict = {}
        for row in cur.fetchall():
            country_by_region.setdefault(row["region"], []).append(row["country"])

    return {
        "institution_types": inst_types,
        "regions":           regions,
        "countries":         countries,
        "cities":            cities,
        "countryByRegion":   country_by_region,
        "sources":           ["both", "dynamo_only", "preqin_only"],
        "investor_statuses": ["Active LP", "Prospect"],
        "workflow_statuses": list(VALID_WORKFLOW_STATUSES) + ["no_contacts"],
    }


# ── Stats dashboard ───────────────────────────────────────────────────────────
@app.get("/api/stats", dependencies=[Depends(verify_token)])
def get_stats(db=Depends(get_db)):
    with dict_cursor(db) as cur:
        cur.execute("""
            SELECT
                (SELECT COUNT(*) FROM lp_firms WHERE is_active = 1)                                         AS total_firms,
                (SELECT COUNT(*) FROM lp_firms WHERE workflow_status = 'unreviewed'      AND is_active = 1)  AS firms_unreviewed,
                (SELECT COUNT(*) FROM lp_firms WHERE workflow_status = 'in_progress'     AND is_active = 1)  AS firms_in_progress,
                (SELECT COUNT(*) FROM lp_firms WHERE workflow_status = 'complete'        AND is_active = 1)  AS firms_complete,
                (SELECT COUNT(*) FROM lp_firms WHERE workflow_status = 'needs_attention' AND is_active = 1)  AS firms_needs_attention,
                (SELECT COUNT(*) FROM lp_contacts WHERE is_active = 1)                                       AS total_contacts,
                (SELECT COUNT(*) FROM lp_contacts WHERE filter_status = 'approved'       AND is_active = 1)  AS approved,
                (SELECT COUNT(*) FROM lp_contacts WHERE is_selected = 1                 AND is_active = 1)   AS selected,
                (SELECT COUNT(*) FROM lp_contacts WHERE filter_status = 'pending_review' AND is_active = 1)  AS pending_review,
                (SELECT COUNT(*) FROM outreach_log)                                                          AS outreach_entries
        """)
        return dict(cur.fetchone())


# ── Serve React SPA ───────────────────────────────────────────────────────────
if STATIC_DIR.exists():
    # Serve bundled JS/CSS assets
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Serve index.html for all non-API routes (React Router handles them)
        return FileResponse(str(STATIC_DIR / "index.html"))
else:
    @app.get("/")
    def root():
        return {"message": "LP Contact Intelligence System API", "docs": "/api/docs"}


# ── Run locally ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
