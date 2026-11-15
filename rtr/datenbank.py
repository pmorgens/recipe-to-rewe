"""Lokale Produktdatenbank (SQLite): Produkte, Suchbegriffe, Standardzutaten; Abfragen für die Datenbankseite."""
import sqlite3, time
from contextlib import closing
from .config import B, ascii_, settings
from .standard import standard_info, standard_liste  # noqa: F401 (Standardzutaten liegen in standard.db)

SCHEMA = """
CREATE TABLE IF NOT EXISTS produkte(id TEXT PRIMARY KEY, name TEXT, url TEXT, image TEXT, marke TEXT, packung TEXT,
  kategorien TEXT, gesehen REAL, details_stand REAL);
CREATE TABLE IF NOT EXISTS suchen(begriff TEXT PRIMARY KEY, stand REAL);
CREATE TABLE IF NOT EXISTS treffer(begriff TEXT, produkt_id TEXT, rang INTEGER, PRIMARY KEY(begriff, produkt_id));
CREATE INDEX IF NOT EXISTS ix_treffer_p ON treffer(produkt_id);
"""
PF = ("id", "name", "url", "image", "marke", "packung", "kategorien", "gesehen")

def db():
    c = sqlite3.connect(B / "produkte.db"); c.row_factory = sqlite3.Row; c.executescript(SCHEMA)
    return c
def prow(r): return {k: (r[k] or "") if k != "gesehen" else (r[k] or 0) for k in PF}
def gueltig(): return settings()["gueltig_tage"] * 86400

def db_kandidaten(q, words):
    """Zuerst die Datenbank fragen. Rückgabe (Liste, Quelle) oder (None, None), wenn die API gefragt werden muss."""
    now, ttl = time.time(), gueltig()
    with closing(db()) as c:
        s = c.execute("SELECT stand FROM suchen WHERE begriff=?", (q,)).fetchone()
        if s and now - s["stand"] < ttl:  # gleicher Suchbegriff schon gesucht (auch ohne Treffer)
            rows = c.execute("SELECT p.* FROM treffer t JOIN produkte p ON p.id=t.produkt_id WHERE t.begriff=? ORDER BY t.rang", (q,)).fetchall()
            return [prow(r) for r in rows], "Datenbank (gleicher Suchbegriff)"
        rows = [r for r in c.execute("SELECT * FROM produkte") if now - (r["gesehen"] or 0) < ttl and all(w in ascii_(r["name"]) for w in words)]
        if len(rows) >= 2: return [prow(r) for r in rows[:40]], "Datenbank (Namensabgleich)"
    return None, None

def db_speichern(q, items):
    now = time.time(); ids = [str(it["id"]) for it in items]
    with closing(db()) as c:
        vorhanden = {r[0] for r in c.execute(f"SELECT id FROM produkte WHERE id IN ({','.join('?' * len(ids))})", ids)} if ids else set()
        c.execute("DELETE FROM treffer WHERE begriff=?", (q,))
        for n, it in enumerate(items):
            c.execute("INSERT INTO produkte(id,name,url,image,gesehen) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
                      "name=excluded.name,url=excluded.url,image=excluded.image,gesehen=excluded.gesehen",
                      (str(it["id"]), it.get("name", ""), it.get("url", ""), it.get("image", ""), now))
            c.execute("INSERT OR REPLACE INTO treffer VALUES(?,?,?)", (q, str(it["id"]), n))
        c.execute("INSERT OR REPLACE INTO suchen VALUES(?,?)", (q, now)); c.commit()
    return len(ids) - len(vorhanden)

def dbview(q=""):
    q = q.strip().lower(); like = f"%{q}%"
    with closing(db()) as c:
        n = c.execute("SELECT COUNT(*) FROM produkte").fetchone()[0]
        rows = c.execute("SELECT p.*, (SELECT GROUP_CONCAT(begriff, ', ') FROM (SELECT DISTINCT begriff FROM treffer WHERE produkt_id=p.id)) AS begriffe "
                         "FROM produkte p WHERE (?='' OR lower(p.name) LIKE ? OR lower(p.marke) LIKE ? OR EXISTS(SELECT 1 FROM treffer t WHERE t.produkt_id=p.id AND t.begriff LIKE ?)) "
                         "ORDER BY p.gesehen DESC LIMIT 50", (q, like, like, like)).fetchall()
        std = standard_liste()
        return {"gesamt": n, "standard": std, "produkte": [{**prow(r), "begriffe": r["begriffe"] or "", "details": bool(r["details_stand"])} for r in rows]}

def dbpage(q="", offset=0, limit=100):
    q = q.strip().lower(); like = f"%{q}%"; limit = max(1, min(int(limit), 200)); offset = max(0, int(offset))
    w = "(?='' OR lower(p.name) LIKE ? OR lower(p.marke) LIKE ? OR lower(p.kategorien) LIKE ? OR EXISTS(SELECT 1 FROM treffer t WHERE t.produkt_id=p.id AND t.begriff LIKE ?))"
    a = (q, like, like, like, like)
    with closing(db()) as c:
        gesamt = c.execute("SELECT COUNT(*) FROM produkte p WHERE " + w, a).fetchone()[0]
        alle = c.execute("SELECT COUNT(*) FROM produkte").fetchone()[0]
        rows = c.execute("SELECT p.*, (SELECT GROUP_CONCAT(begriff, ', ') FROM (SELECT DISTINCT begriff FROM treffer WHERE produkt_id=p.id)) AS begriffe FROM produkte p WHERE " + w +
                         " ORDER BY p.gesehen DESC, p.name LIMIT ? OFFSET ?", a + (limit, offset)).fetchall()
    return {"gesamt": gesamt, "alle": alle, "offset": offset, "produkte": [{**prow(r), "begriffe": r["begriffe"] or "", "details_stand": r["details_stand"] or 0} for r in rows]}

def dbsuchen():
    ttl = gueltig()
    with closing(db()) as c:
        rows = c.execute("SELECT s.begriff, s.stand, (SELECT COUNT(*) FROM treffer t WHERE t.begriff=s.begriff) AS n FROM suchen s ORDER BY s.stand DESC").fetchall()
    return {"gueltig_tage": settings()["gueltig_tage"], "suchen": [{"begriff": r["begriff"], "stand": r["stand"], "treffer": r["n"], "gueltig_bis": r["stand"] + ttl} for r in rows]}

def export_csv():
    import csv, io
    buf = io.StringIO(); w = csv.writer(buf, delimiter=";")
    w.writerow(["id", "name", "marke", "packung", "kategorien", "url", "bild", "suchbegriffe", "zuletzt_gesehen", "details_geladen"])
    with closing(db()) as c:
        for r in c.execute("SELECT p.*, (SELECT GROUP_CONCAT(begriff, ' | ') FROM (SELECT DISTINCT begriff FROM treffer WHERE produkt_id=p.id)) AS b FROM produkte p ORDER BY p.name"):
            w.writerow([r["id"], r["name"], r["marke"] or "", r["packung"] or "", r["kategorien"] or "", r["url"] or "", r["image"] or "", r["b"] or "",
                        time.strftime("%Y-%m-%d", time.localtime(r["gesehen"] or 0)), "ja" if r["details_stand"] else "nein"])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")

def dbstats():
    with closing(db()) as c:
        return {"db_produkte": c.execute("SELECT COUNT(*) FROM produkte").fetchone()[0], "db_suchen": c.execute("SELECT COUNT(*) FROM suchen").fetchone()[0],
                "db_details": c.execute("SELECT COUNT(*) FROM produkte WHERE details_stand IS NOT NULL").fetchone()[0],
                "db_standard": len(standard_liste())}
