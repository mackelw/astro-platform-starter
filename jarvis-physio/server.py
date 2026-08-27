"""Local HTTP host for the J.A.R.V.I.S. interface.

Serves the HUD and exposes the voice router over JSON. Standard library only —
no framework, no build step, nothing to install.

BINDS TO LOOPBACK ONLY. This process can read every clinical record in the
database, and it has no authentication of its own; the only thing keeping that
private is that nothing off the machine can reach the socket. Do not change
HOST to 0.0.0.0 or put this behind a tunnel without putting real auth,
transport encryption and an access log in front of it first.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import database as db
import jarvis_voice

HOST = "127.0.0.1"          # loopback only — see the warning above
PORT = 8765
STATIC = Path(__file__).parent / "static"
_CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css",
                  ".js": "text/javascript", ".svg": "image/svg+xml",
                  ".json": "application/json"}
MAX_BODY = 64 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "JarvisHUD/1.0"

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            return self._serve_file(STATIC / "jarvis.html")
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/api/telemetry":
            return self._json(jarvis_voice.telemetry())
        if self.path.startswith("/static/"):
            # Resolve and confirm the result stays inside STATIC — a path like
            # /static/../../etc/passwd must not escape the directory.
            target = (STATIC / self.path[len("/static/"):]).resolve()
            if STATIC.resolve() in target.parents and target.is_file():
                return self._serve_file(target)
            return self._error(404, "not found")
        return self._error(404, "not found")

    def do_POST(self):
        if self.path != "/api/command":
            return self._error(404, "not found")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._error(400, "bad length")
        if length <= 0 or length > MAX_BODY:
            return self._error(400, "bad body size")
        try:
            payload = json.loads(self.rfile.read(length))
            utterance = str(payload.get("text", ""))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self._error(400, "bad json")
        result = jarvis_voice.handle(utterance)
        result["telemetry"] = jarvis_voice.telemetry()
        return self._json(result)

    # -- plumbing --------------------------------------------------------
    def _serve_file(self, path: Path):
        if not path.is_file():
            return self._error(404, "not found")
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type",
                         _CONTENT_TYPES.get(path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        self._json({"error": message}, status=status)

    def log_message(self, fmt, *args):
        print(f"  [http] {fmt % args}")


def main():
    db.init_db()
    print("\n  ┌─────────────────────────────────────────────┐")
    print("  │  J.A.R.V.I.S.  —  Jarvis Physio interface   │")
    print("  └─────────────────────────────────────────────┘")
    print(f"\n  HUD:   http://{HOST}:{PORT}")
    print(f"  Voice: Chrome or Edge (Web Speech API). Allow the microphone.")
    print(f"  Bound to loopback only — not reachable from the network.")
    print(f"  Sign-off by voice: "
          f"{'ENABLED' if jarvis_voice.VOICE_SIGNOFF_ENABLED else 'disabled'}\n")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
