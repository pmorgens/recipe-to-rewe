"""Gemeinsame Grundlagen: Pfade, Einstellungen, API-Schlüssel, Hilfsfunktionen."""
import json, os, re
from pathlib import Path

B = Path(__file__).resolve().parent.parent  # Programmordner: hier liegen settings.json, produkte.db, .env ...
UA = "Recipe-to-REWE/1.0 (privater Gebrauch, lokal)"
DEF = {"modell": "", "markt": "", "ort": "", "markt_id": "", "markt_url": "", "stufe2": True, "limit": 800, "timeout_s": 300, "max_s": 1800, "gueltig_tage": 90, "details_auto": True,
       "grund": ["salz", "pfeffer", "wasser", "öl", "zucker"]}
norm = lambda t: re.sub(r"\s+", " ", t).strip().lower()

def jload(n, d):
    try: return json.loads((B / n).read_text(encoding="utf-8"))
    except Exception: return d
def jsave(n, o): (B / n).write_text(json.dumps(o, ensure_ascii=False, indent=1), encoding="utf-8")
def settings(): return {**DEF, **jload("settings.json", {})}

class Err(Exception): pass

def ascii_(t): return t.lower().translate(str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}))

def get_key():  # wird bei jedem Aufruf neu gelesen, ein Neustart ist nach Änderung der .env nicht nötig
    k = os.environ.get("APISH_KEY", "").strip()
    if k: return k, "Umgebungsvariable"
    for n in (".env", ".env.txt", ".env.example"):
        try: txt = (B / n).read_text(encoding="utf-8-sig")
        except OSError: continue
        for l in txt.splitlines():
            a, _, v = l.partition("=")
            if a.strip() == "APISH_KEY" and v.strip().strip("\"'"): return v.strip().strip("\"'"), n
    return "", ""
