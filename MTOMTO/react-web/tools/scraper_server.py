#!/usr/bin/env python3
"""
MTO Scraper Server — local bridge between the React app and the Python scrapers.

Runs on http://localhost:5001
POST /scrape        { "region": "Portland_Metro", "category": "Flower" }  (both optional)
GET  /scrape/status → { status, started_at, finished_at, products_found, error }
GET  /health        → { "ok": true }

Usage:
  python tools/scraper_server.py
"""

import json
import os
import subprocess
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT    = 5001
TOOLS   = Path(__file__).parent
DUTCHIE = TOOLS / "scraper_dutchie.py"
MTHRIVE = TOOLS / "scraper_mthrive.py"

# Regions covered by each scraper
DUTCHIE_REGIONS = {
    "Portland_Metro", "Southern_Oregon", "Central_Oregon",
    "Coastal_Oregon", "Eastern_Oregon",
}
MTHRIVE_REGION = "Eastern_Oregon"

# ── State ─────────────────────────────────────────────────────────────────────

_lock  = threading.Lock()
_state = {
    "status":         "idle",
    "started_at":     None,
    "finished_at":    None,
    "products_found": None,
    "error":          None,
}


def _run_scrapers(region: str | None, category: str | None):
    with _lock:
        _state.update({
            "status": "running", "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None, "products_found": None, "error": None,
        })

    total_rows = 0
    errors: list[str] = []

    # Build the list of scrapers to run
    # Each entry: (script_path, extra_args)
    jobs: list[tuple[Path, list[str]]] = []

    run_dutchie = DUTCHIE.exists() and (region is None or region in DUTCHIE_REGIONS)
    run_mthrive = MTHRIVE.exists() and (region is None or region == MTHRIVE_REGION)

    if run_dutchie:
        extra: list[str] = []
        if region:
            extra += ["--region", region]
        if category:
            extra += ["--category", category]
        jobs.append((DUTCHIE, extra))

    if run_mthrive:
        extra = []
        if category:
            extra += ["--category", category]
        jobs.append((MTHRIVE, extra))

    if not jobs:
        with _lock:
            _state.update({
                "status": "error", "finished_at": datetime.now(timezone.utc).isoformat(),
                "error": "No scrapers match the selected filters.",
            })
        return

    for script, extra_args in jobs:
        cmd = [sys.executable, str(script)] + extra_args
        label = script.stem
        print(f"[server] Running: {' '.join(cmd)}")
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            for line in proc.stdout:
                line = line.rstrip("\n")
                print(f"  [{label}] {line}")
                # Parse product/row counts from output lines
                for marker in ("total rows", "Uploaded", "rows from"):
                    if marker in line:
                        for tok in line.split():
                            tok = tok.replace(",", "")
                            if tok.isdigit():
                                total_rows += int(tok)
                                with _lock:
                                    _state["products_found"] = total_rows
                                break
            proc.wait()
            if proc.returncode != 0:
                errors.append(f"{label} exited with code {proc.returncode}")
        except Exception as e:
            errors.append(f"{label}: {e}")

    with _lock:
        _state["finished_at"]    = datetime.now(timezone.utc).isoformat()
        _state["products_found"] = total_rows
        if errors:
            _state["status"] = "error"
            _state["error"]  = "; ".join(errors)
        else:
            _state["status"] = "done"
            _state["error"]  = None


# ── HTTP handler ──────────────────────────────────────────────────────────────

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass

    def _send(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        for k, v in CORS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in CORS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        if self.path == "/scrape/status":
            with _lock:
                self._send(200, dict(_state))
        elif self.path == "/health":
            self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/scrape":
            with _lock:
                if _state["status"] == "running":
                    self._send(409, {"error": "A scrape is already running."})
                    return

            # Read optional JSON body
            region = category = None
            length = int(self.headers.get("Content-Length", 0))
            if length > 0:
                try:
                    body = json.loads(self.rfile.read(length))
                    region   = body.get("region")   or None
                    category = body.get("category") or None
                except Exception:
                    pass

            t = threading.Thread(target=_run_scrapers, args=(region, category), daemon=True)
            t.start()
            self._send(200, {"started": True, "region": region, "category": category})
        else:
            self._send(404, {"error": "not found"})


# ── Entry ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    missing = [s.name for s in (DUTCHIE, MTHRIVE) if not s.exists()]
    if missing:
        print(f"WARNING: scrapers not found: {missing}", file=sys.stderr)

    server = HTTPServer(("localhost", PORT), Handler)
    print(f"MTO Scraper Server running at http://localhost:{PORT}")
    print(f"  POST /scrape        — start a scrape (optional JSON: {{region, category}})")
    print(f"  GET  /scrape/status — check current status")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
