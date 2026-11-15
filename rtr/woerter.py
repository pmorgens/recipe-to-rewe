"""Wortdatenbank (woerter.db): lernt Zusammenhänge zwischen Zutaten, Schreibweisen, Suchbegriffen und Produkten.
Drei Tabellen: schreibweise (Variante -> Hauptform), suchbegriff (Zutat -> Begriff, der zu einem Treffer führte),
zuordnung (Zutat -> gewähltes Produkt; eine Auswahl des Nutzers hat Vorrang vor der des Modells)."""
import difflib, re, sqlite3, time
from contextlib import closing
from .config import B, ascii_

SCHEMA = """
CREATE TABLE IF NOT EXISTS schreibweise(variante TEXT PRIMARY KEY, hauptform TEXT, quelle TEXT, stand REAL);
CREATE TABLE IF NOT EXISTS suchbegriff(zutat TEXT, begriff TEXT, quelle TEXT, treffer INTEGER DEFAULT 1, stand REAL, PRIMARY KEY(zutat, begriff));
CREATE TABLE IF NOT EXISTS zuordnung(zutat TEXT PRIMARY KEY, produkt_id TEXT, name TEXT, url TEXT, image TEXT, quelle TEXT, stand REAL);
CREATE INDEX IF NOT EXISTS ix_zuordnung_p ON zuordnung(produkt_id);
"""
START = {"hähnchenbrustfilet": ["hähnchenbrust", "hähnchen", "huhn"], "hähnchenbrust": ["hähnchen", "huhn"], "hühnerbrust": ["hähnchenbrust", "hähnchen"],
         "putenbrustfilet": ["putenbrust", "pute"], "rinderhackfleisch": ["hackfleisch rind", "hackfleisch"], "gemischtes hackfleisch": ["hackfleisch"],
         "knoblauchzehe": ["knoblauch"], "frühlingszwiebel": ["lauchzwiebel"], "passierte tomaten": ["tomaten passiert"], "sahne": ["schlagsahne"],
         "creme fraiche": ["crème fraîche"], "taco-gewürz": ["taco gewürzmischung"], "hähnchenschenkel": ["hähnchenkeule", "hähnchen", "huhn"]}
def wdb():
    c = sqlite3.connect(B / "woerter.db"); c.row_factory = sqlite3.Row; c.executescript(SCHEMA)
    for z, bs in START.items():  # Startliste, wird durch Gelerntes ergänzt (treffer 0 = nur Vorschlag, Gelerntes steht davor)
        for b in bs: c.execute("INSERT OR IGNORE INTO suchbegriff VALUES(?,?,?,0,?)", (z, b, "start", 0))
    c.commit(); return c

def sauber(t): return re.sub(r"\s+", " ", re.sub(r"\(.*?\)", " ", str(t or "")).lower()).strip()
def stamm(t):  # grobe Regel für Mehrzahl: Zwiebeln = Zwiebel, Tomaten = Tomate
    s = re.sub(r"[^a-z]", "", ascii_(sauber(t)))
    for suf in ("en", "n", "e", "s"):
        if len(s) > 5 and s.endswith(suf): return s[:-len(suf)]
    return s

def hauptform(c, q):
    r = c.execute("SELECT hauptform FROM schreibweise WHERE variante=?", (q,)).fetchone()
    return r["hauptform"] if r else q

def variante_merken(c, a, b, quelle):
    a, b = sauber(a), sauber(b)
    if not a or not b or a == b: return
    h = hauptform(c, b); a = hauptform(c, a) if hauptform(c, a) != a else a
    if a == h: return
    c.execute("INSERT OR REPLACE INTO schreibweise VALUES(?,?,?,?)", (a, h, quelle, time.time()))

def erinnern(q):
    """Bekanntes Produkt zu einer Zutat (auch über ähnliche Schreibweise) oder None. Rückgabe: Produkt + Herkunft."""
    q = sauber(q)
    if not q: return None
    with closing(wdb()) as c:
        h = hauptform(c, q)
        r = c.execute("SELECT * FROM zuordnung WHERE zutat IN (?,?) ORDER BY zutat=? DESC", (h, q, h)).fetchone()
        via = "" if r and r["zutat"] == q else (f" über ähnliche Schreibweise „{r['zutat']}“" if r else "")
        if not r:
            for x in c.execute("SELECT * FROM zuordnung"):
                if stamm(x["zutat"]) == stamm(q): r = x; via = f" über ähnliche Schreibweise „{x['zutat']}“"; variante_merken(c, q, x["zutat"], "regel"); c.commit(); break
        if not r: return None
        return {"id": r["produkt_id"], "name": r["name"], "url": r["url"], "image": r["image"], "quelle": r["quelle"], "via": via, "zutat": r["zutat"]}

def alternativen(q):
    q = sauber(q)
    with closing(wdb()) as c:
        h = hauptform(c, q)
        return [r["begriff"] for r in c.execute("SELECT begriff FROM suchbegriff WHERE zutat IN (?,?) ORDER BY treffer DESC, stand DESC, rowid", (h, q))]

def merken(q, p, quelle):
    """Zutat -> Produkt speichern. quelle 'nutzer' überschreibt alles, 'modell' nur Einträge des Modells."""
    q = sauber(q)
    if not q or not p or not p.get("id"): return False
    with closing(wdb()) as c:
        h = hauptform(c, q); alt = c.execute("SELECT quelle FROM zuordnung WHERE zutat=?", (h,)).fetchone()
        if alt and alt["quelle"] == "nutzer" and quelle != "nutzer": return False
        c.execute("INSERT OR REPLACE INTO zuordnung VALUES(?,?,?,?,?,?,?)", (h, str(p["id"]), p.get("name", ""), p.get("url", ""), p.get("image", ""), quelle, time.time()))
        if h != q: variante_merken(c, q, h, quelle)
        for x in c.execute("SELECT zutat FROM zuordnung WHERE produkt_id=? AND zutat!=?", (str(p["id"]), h)).fetchall():  # gleiches Produkt, ähnlicher Name = gleiche Zutat
            if difflib.SequenceMatcher(None, ascii_(x["zutat"]), ascii_(h)).ratio() >= .75 or ascii_(h).startswith(ascii_(x["zutat"])) or ascii_(x["zutat"]).startswith(ascii_(h)):
                variante_merken(c, x["zutat"], h, "gleiches Produkt")
        c.commit()
    return True

def begriff_merken(zutat, begriff, quelle="modell"):
    z, b = sauber(zutat), sauber(begriff)
    if not z or not b or z == b: return
    with closing(wdb()) as c:
        z = hauptform(c, z)
        c.execute("INSERT INTO suchbegriff VALUES(?,?,?,1,?) ON CONFLICT(zutat,begriff) DO UPDATE SET treffer=treffer+1, stand=excluded.stand", (z, b, quelle, time.time())); c.commit()

def woerterstats():
    with closing(wdb()) as c:
        return {"w_schreibweisen": c.execute("SELECT COUNT(*) FROM schreibweise").fetchone()[0], "w_suchbegriffe": c.execute("SELECT COUNT(*) FROM suchbegriff").fetchone()[0],
                "w_zuordnungen": c.execute("SELECT COUNT(*) FROM zuordnung").fetchone()[0]}

def woerteransicht():
    with closing(wdb()) as c:
        return {"schreibweisen": [dict(r) for r in c.execute("SELECT * FROM schreibweise ORDER BY hauptform, variante")],
                "suchbegriffe": [dict(r) for r in c.execute("SELECT * FROM suchbegriff ORDER BY stand DESC")],
                "zuordnungen": [dict(r) for r in c.execute("SELECT * FROM zuordnung ORDER BY stand DESC")]}

def vergessen(art, schluessel):
    t = {"schreibweise": ("schreibweise", "variante"), "zuordnung": ("zuordnung", "zutat")}.get(art)
    if t:
        with closing(wdb()) as c: c.execute(f"DELETE FROM {t[0]} WHERE {t[1]}=?", (schluessel,)); c.commit()
