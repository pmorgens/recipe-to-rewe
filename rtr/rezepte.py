"""Rezeptdatenbank (rezepte.db): fertige Rezepte, gespeichert über den Button unter dem Rezept.
Je Rezept die Daten als JSON (Zutaten mit Menge, Status, Produkt oder Ersatz; Schritte mit Hinweisen) und die fertige Ansicht als HTML,
damit es später genau so wieder gezeigt werden kann."""
import json, sqlite3, time
from contextlib import closing
from .config import B, Err

SCHEMA = """
CREATE TABLE IF NOT EXISTS rezept(id INTEGER PRIMARY KEY, name TEXT, portionen TEXT, markt TEXT, zutaten INTEGER, ersatz INTEGER, offen INTEGER,
  lauf INTEGER, erstellt REAL, geaendert REAL, daten TEXT, html TEXT);
CREATE INDEX IF NOT EXISTS ix_rezept_geaendert ON rezept(geaendert);
"""
MAX_HTML = 2_000_000

def rdb():
    c = sqlite3.connect(B / "rezepte.db", timeout=5); c.row_factory = sqlite3.Row; c.executescript(SCHEMA)
    return c

def speichern(daten, html, rid=None, lauf=None):
    """Neues Rezept anlegen oder, mit rid, die gespeicherte Fassung ersetzen. Rückgabe: Nummer des Rezepts."""
    if not isinstance(daten, dict) or not str(daten.get("name") or "").strip(): raise Err("Das Rezept hat keinen Namen und wurde nicht gespeichert.")
    if len(html or "") > MAX_HTML: raise Err("Das Rezept ist zu groß zum Speichern.")
    z = daten.get("zutaten") or []
    werte = (str(daten["name"]).strip(), str(daten.get("portionen") or ""), str(daten.get("markt") or ""), len(z),
             sum(1 for x in z if str(x.get("status", "")).startswith("Ersatz")), sum(1 for x in z if x.get("status") == "Im Markt prüfen"))
    now, js = time.time(), json.dumps(daten, ensure_ascii=False)
    with closing(rdb()) as c:
        if rid and c.execute("SELECT 1 FROM rezept WHERE id=?", (int(rid),)).fetchone():
            c.execute("UPDATE rezept SET name=?,portionen=?,markt=?,zutaten=?,ersatz=?,offen=?,geaendert=?,daten=?,html=? WHERE id=?", (*werte, now, js, html, int(rid)))
            c.commit(); return int(rid)
        cur = c.execute("INSERT INTO rezept(name,portionen,markt,zutaten,ersatz,offen,lauf,erstellt,geaendert,daten,html) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (*werte, lauf, now, now, js, html)); c.commit(); return cur.lastrowid

def liste():
    with closing(rdb()) as c:
        return [dict(r) for r in c.execute("SELECT id,name,portionen,markt,zutaten,ersatz,offen,erstellt,geaendert FROM rezept ORDER BY geaendert DESC")]

def holen(rid):
    with closing(rdb()) as c:
        r = c.execute("SELECT * FROM rezept WHERE id=?", (int(rid),)).fetchone()
    if not r: raise Err(f"Rezept Nr. {rid} gibt es nicht.")
    return {**dict(r), "daten": json.loads(r["daten"] or "{}")}

def loeschen(rid):
    with closing(rdb()) as c: c.execute("DELETE FROM rezept WHERE id=?", (int(rid),)); c.commit()
