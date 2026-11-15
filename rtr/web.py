"""Weboberfläche: Diagnose, Tests und der lokale HTTP-Server mit allen Routen."""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from . import apish, hellofresh, modell, woerter
from .config import B, Err, get_key, jload, jsave, settings
from .datenbank import dbpage, dbstats, dbsuchen, dbview, export_csv
from .protokoll import LOG, _V, _lock, end, ev
from .rezept import anreichern, extract, substitute

def diag():
    k, src = get_key(); s = settings()
    try:
        with urllib.request.urlopen(modell.OLLAMA + "/api/tags", timeout=3) as f: m = [x["name"] for x in json.loads(f.read())["models"]]
    except Exception: m = None
    try:
        with urllib.request.urlopen(modell.OLLAMA + "/api/version", timeout=3) as f: ver = json.loads(f.read()).get("version", "")
    except Exception: ver = ""
    try: alt = tuple(int(x) for x in ver.split("-")[0].split(".")[:2]) < (0, 5)
    except ValueError: alt = False
    cr = jload("credits.json", {})
    return {"ollama_version": ver, "ollama_alt": alt, "python": sys.version.split()[0], "ordner": str(B), "env_dateien": [n for n in (".env", ".env.txt", ".env.example") if (B / n).exists()],
            "key": bool(k), "key_quelle": src, "key_laenge": len(k), "api_url": apish.API, "ollama": m is not None, "modelle": m or [], "modell": s["modell"],
            "modell_ok": bool(m) and s["modell"] in m, "stufe2": s["stufe2"], "markt": s["markt"], "markt_id": s["markt_id"], "limit": s["limit"],
            "credits": cr.get("verbraucht", 0) if cr.get("monat") == date.today().strftime("%Y-%m") else 0, "gueltig_tage": s["gueltig_tage"], **dbstats(), **woerter.woerterstats()}

def test(was):
    if was == "api":
        d, _ = apish.api("/markets", {"q": "Gummersbach", "limit": 1}, 0)  # ttl 0: immer echter Aufruf, 1 Credit
        return {"ok": True, "detail": f"{len(d.get('markets', []))} Markt gefunden"}
    modell.llm("Antworte mit JSON.", "Sag ok.", {"type": "object", "required": ["antwort"], "properties": {"antwort": {"type": "string"}}})
    return {"ok": True, "detail": "Modell hat geantwortet"}

# ---------- HTTP ----------
START = time.time()
def version():
    """Ändert sich bei jedem Neustart und bei jeder Änderung an Programm-, Seiten- oder Prompt-Dateien; die Seiten zeigen dann einen Hinweis."""
    p = [B / "server.py", *B.glob("rtr/*.py"), *B.glob("static/*"), *B.glob("prompts/*.txt")]
    return f"{int(START)}-" + str(sum(int(x.stat().st_mtime * 1000) for x in p if x.exists()))

class H(BaseHTTPRequestHandler):
    def out(self, o, code=200, ctype="application/json", headers=None):
        b = o if isinstance(o, bytes) else json.dumps(o, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path.startswith("/static/"):
            f = (B / "static" / u.path[8:]).resolve()
            if (B / "static").resolve() in f.parents and f.is_file():
                return self.out(f.read_bytes(), ctype={".css": "text/css", ".js": "text/javascript"}.get(f.suffix, "application/octet-stream"), headers={"Cache-Control": "no-store"})
            return self.out({"fehler": "nicht gefunden"}, 404)
        if u.path == "/api/version": return self.out({"v": version()})
        if u.path == "/": return self.out((B / "static" / "index.html").read_bytes(), ctype="text/html", headers={"Cache-Control": "no-store"})
        if u.path == "/datenbank": return self.out((B / "static" / "datenbank.html").read_bytes(), ctype="text/html", headers={"Cache-Control": "no-store"})
        if u.path == "/status": return self.out((B / "static" / "status.html").read_bytes(), ctype="text/html", headers={"Cache-Control": "no-store"})
        if u.path == "/api/log":
            since = int((urllib.parse.parse_qs(u.query).get("since") or ["0"])[0])
            with _lock: return self.out({"v": _V[0], "events": [{k: v for k, v in e.items() if k not in ("t0", "v")} for e in LOG.values() if e["v"] > since]})
        if u.path == "/api/diag": return self.out(diag())
        if u.path == "/api/dbpage":
            g = lambda k, d="": (urllib.parse.parse_qs(u.query).get(k) or [d])[0]
            return self.out(dbpage(g("q"), g("offset", "0"), g("limit", "100")))
        if u.path == "/api/woerter": return self.out(woerter.woerteransicht())
        if u.path == "/api/dbsuchen": return self.out(dbsuchen())
        if u.path == "/api/db/export.csv": return self.out(export_csv(), ctype="text/csv", headers={"Content-Disposition": 'attachment; filename="produkte.csv"'})
        if u.path == "/api/db": return self.out(dbview((urllib.parse.parse_qs(u.query).get("q") or [""])[0]))
        if u.path == "/api/status":
            try:
                with urllib.request.urlopen(modell.OLLAMA + "/api/tags", timeout=3) as f: m = [x["name"] for x in json.loads(f.read())["models"]]
            except Exception: m = None
            cr = jload("credits.json", {})
            return self.out({"ollama": m is not None, "modelle": m or [], "settings": settings(), "key": bool(get_key()[0]),
                             "credits": cr.get("verbraucht", 0) if cr.get("monat") == date.today().strftime("%Y-%m") else 0})
        self.out({"fehler": "nicht gefunden"}, 404)
    def do_POST(self):
        o = self.headers.get("Origin", "")
        if o and not re.match(r"http://(127\.0\.0\.1|localhost)(:\d+)?$", o): return self.out({"fehler": "verboten"}, 403)
        b = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        LBL = {"/api/extract": "Programm: Rezept auslesen", "/api/products": "Programm: Produkte zu einer Zutat suchen", "/api/substitute": "Programm: Ersatz vorschlagen",
               "/api/markets": "Programm: Märkte suchen", "/api/url": "Programm: HelloFresh-Seite laden", "/api/details": "Programm: Produktdetails holen", "/api/test": "Programm: Verbindungstest", "/api/merken": "Programm: Auswahl in der Wortdatenbank merken", "/api/vergessen": "Programm: Eintrag der Wortdatenbank löschen"}
        p = self.path; i = None if p == "/api/settings" else ev(LBL.get(p, "Programm: " + p), "run", "interner Schritt, verbraucht selbst keine Credits", kind="programm")
        try:
            if p == "/api/settings": jsave("settings.json", {**settings(), **b}); r = {"ok": True}
            elif p == "/api/url": t, w = hellofresh.recipe_from_url(b["url"]); r = {"text": t, "warnung": w}
            elif p == "/api/extract": r = extract(b["text"])
            elif p == "/api/substitute": r = anreichern(substitute(b["rezept"], b["index"], b.get("bisher", [])), b["rezept"]["zutaten"][b["index"]]["name"])
            elif p == "/api/merken": r = {"ok": woerter.merken(b["zutat"], b["produkt"], "nutzer")}
            elif p == "/api/vergessen": woerter.vergessen(b["art"], b["schluessel"]); r = {"ok": True}
            elif p == "/api/markets": r = apish.markets(b["q"])
            elif p == "/api/products": r = apish.products(b["name"])
            elif p == "/api/details": r = apish.details(b["id"])
            elif p == "/api/test": r = test(b["was"])
            else: r = {"fehler": "nicht gefunden"}
            end(i, "error" if isinstance(r, dict) and r.get("fehler") else "ok"); return self.out(r)
        except Err as e: end(i, "error", str(e)); self.out({"fehler": str(e)})
        except Exception as e: end(i, "error", repr(e)); self.out({"fehler": f"Unerwarteter Fehler: {e}"})

def main():
    port = int(os.environ.get("PORT", 8000))
    print(f"Recipe-to-REWE läuft auf http://127.0.0.1:{port}  (Beenden: Strg+C)")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
