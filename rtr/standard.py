"""Standardzutaten (standard.db): Zutaten wie Wasser und Salz, die nie gesucht werden und nichts kosten. Wird als Erstes gefragt."""
import re, sqlite3, urllib.parse
from contextlib import closing
from .config import B

SCHEMA = "CREATE TABLE IF NOT EXISTS standard(name TEXT PRIMARY KEY, image TEXT, aliases TEXT);"
STD = [("Wasser", "💧", "wasser, leitungswasser, kochendes wasser, heißes wasser, heisses wasser"),
       ("Salz", "🧂", "salz, speisesalz, jodsalz, meersalz"),
       ("Pfeffer", "🌶️", "pfeffer, schwarzer pfeffer, pfeffer schwarz"),
       ("Zucker", "🍬", "zucker, haushaltszucker, kristallzucker"),
       ("Öl", "🌻", "öl, speiseöl, pflanzenöl, rapsöl, sonnenblumenöl")]
def icon(e):  # kleines Bild als eingebettete SVG-Grafik, ohne Internet und ohne Credits
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='14' fill='#fff'/><text x='50' y='70' font-size='60' text-anchor='middle'>{e}</text></svg>"
    return "data:image/svg+xml," + urllib.parse.quote(svg)

def sdb():
    c = sqlite3.connect(B / "standard.db"); c.row_factory = sqlite3.Row; c.executescript(SCHEMA)
    for n, e, al in STD: c.execute("INSERT OR IGNORE INTO standard VALUES(?,?,?)", (n, icon(e), al))
    c.commit(); return c

def standard_info(q):
    k = re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", q.lower())).strip()
    with closing(sdb()) as c:
        for r in c.execute("SELECT * FROM standard"):
            if k == r["name"].lower() or k in [a.strip() for a in (r["aliases"] or "").split(",")]: return {"name": r["name"], "image": r["image"]}
    return None

def standard_liste():
    with closing(sdb()) as c: return [dict(r) for r in c.execute("SELECT name, image, aliases FROM standard ORDER BY name")]
