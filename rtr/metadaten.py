"""Metadaten (metadaten.db): Kennzahlen zu API.SH, Ollama, Rezeptläufen, dem Weg jeder Zutat und Ersatzvorschlägen.
Nur Kennzahlen, keine Prompts, Antworten oder Rezepttexte. Ein Fehler beim Schreiben hält das Programm nie an.
Tabellen: api, ollama, rezept, zutat, ersatz. Ein Rezeptlauf (rezept.id) verbindet die Zeilen in zutat und ersatz."""
import sqlite3, time
from contextlib import closing
from .config import B

SCHEMA = """
CREATE TABLE IF NOT EXISTS api(zeit REAL, endpunkt TEXT, begriff TEXT, credits INTEGER, cache TEXT, ms INTEGER, anzahl INTEGER, fehler TEXT);
CREATE TABLE IF NOT EXISTS ollama(zeit REAL, modell TEXT, aufgabe TEXT, ms INTEGER, ms_laden INTEGER, tokens_ein INTEGER, tokens_aus INTEGER,
  tokens_s REAL, versuche INTEGER, json_einfach INTEGER, fehler TEXT);
CREATE TABLE IF NOT EXISTS rezept(id INTEGER PRIMARY KEY, start REAL, ende REAL, quelle TEXT, zutaten INTEGER, schritte INTEGER, warnungen INTEGER,
  ms_extrahieren INTEGER, fehler TEXT, zutaten_gesucht INTEGER DEFAULT 0, ohne_api INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS zutat(zeit REAL, lauf INTEGER, zweck TEXT, zutat TEXT, stufe TEXT, begriff TEXT, kandidaten INTEGER, gewaehlt INTEGER, ms INTEGER);
CREATE TABLE IF NOT EXISTS ersatz(zeit REAL, lauf INTEGER, zutat TEXT, ok INTEGER, unsicher INTEGER, mischung INTEGER, versuche INTEGER, grund TEXT, ms INTEGER);
CREATE INDEX IF NOT EXISTS ix_api_zeit ON api(zeit);
CREATE INDEX IF NOT EXISTS ix_ollama_zeit ON ollama(zeit);
CREATE INDEX IF NOT EXISTS ix_zutat_lauf ON zutat(lauf);
"""
OHNE_API = ("standard", "grund", "erinnerung", "db", "uebersetzung")  # Stufen, die keine API.SH-Anfrage brauchen
STUFEN = ("standard", "grund", "erinnerung", "db", "uebersetzung", "api", "api_uebersetzung", "keine")

def mdb():
    c = sqlite3.connect(B / "metadaten.db", timeout=5); c.row_factory = sqlite3.Row; c.executescript(SCHEMA)
    if "ohne_api" not in [r[1] for r in c.execute("PRAGMA table_info(rezept)")]:  # ältere Datei: Spalten ergänzen und aus den Zutaten nachrechnen
        c.execute("ALTER TABLE rezept ADD COLUMN zutaten_gesucht INTEGER DEFAULT 0"); c.execute("ALTER TABLE rezept ADD COLUMN ohne_api INTEGER DEFAULT 0")
        c.execute(f"UPDATE rezept SET zutaten_gesucht=(SELECT COUNT(*) FROM zutat WHERE lauf=rezept.id AND zweck='zutat'), "
                  f"ohne_api=(SELECT COUNT(*) FROM zutat WHERE lauf=rezept.id AND zweck='zutat' AND stufe IN ({','.join('?' * len(OHNE_API))}))", OHNE_API)
        c.commit()
    return c

def _schreiben(sql, werte):
    try:
        with closing(mdb()) as c: cur = c.execute(sql, werte); c.commit(); return cur.lastrowid
    except sqlite3.Error: return None

def api(endpunkt, begriff, credits=0, cache="", ms=0, anzahl=0, fehler=""):
    _schreiben("INSERT INTO api VALUES(?,?,?,?,?,?,?,?)", (time.time(), endpunkt, begriff, credits, cache or "neu", ms, anzahl, fehler))

def ollama(modell, aufgabe, ms, werte, versuche, json_einfach, fehler=""):
    """werte: die Zahlen aus der letzten Ollama-Antwort (Zeiten in Nanosekunden)."""
    ns = lambda k: int((werte.get(k) or 0) / 1e6)
    aus, dauer = werte.get("eval_count") or 0, werte.get("eval_duration") or 0
    _schreiben("INSERT INTO ollama VALUES(?,?,?,?,?,?,?,?,?,?,?)", (time.time(), modell, aufgabe, ms, ns("load_duration"), werte.get("prompt_eval_count") or 0, aus,
               round(aus / (dauer / 1e9), 1) if dauer else 0, versuche, int(json_einfach), fehler))

def rezept_start(quelle, zutaten, schritte, warnungen, ms, fehler=""):
    now = time.time()
    return _schreiben("INSERT INTO rezept(start,ende,quelle,zutaten,schritte,warnungen,ms_extrahieren,fehler) VALUES(?,?,?,?,?,?,?,?)",
                      (now, now, quelle, zutaten, schritte, warnungen, ms, fehler))

def _lauf_weiter(lauf):  # jeder Schritt eines Laufs schiebt dessen Ende nach hinten: ende - start = Gesamtdauer
    if lauf: _schreiben("UPDATE rezept SET ende=? WHERE id=?", (time.time(), lauf))

def zutat(lauf, zweck, name, stufe, begriff, kandidaten, gewaehlt, ms):
    _schreiben("INSERT INTO zutat VALUES(?,?,?,?,?,?,?,?,?)", (time.time(), lauf, zweck, name, stufe, begriff, kandidaten, int(gewaehlt), ms)); _lauf_weiter(lauf)
    if lauf and zweck == "zutat":  # Anteil ohne API-Kosten je Rezeptlauf mitzählen (für den Verlauf auf /metadaten)
        _schreiben("UPDATE rezept SET zutaten_gesucht=zutaten_gesucht+1, ohne_api=ohne_api+? WHERE id=?", (int(stufe in OHNE_API), lauf))

def ersatz(lauf, name, ok, unsicher, mischung, versuche, grund, ms):
    _schreiben("INSERT INTO ersatz VALUES(?,?,?,?,?,?,?,?,?)", (time.time(), lauf, name, int(ok), int(unsicher), int(mischung), versuche, grund, ms)); _lauf_weiter(lauf)

def uebersicht(tage=30):
    """Zusammenfassung der letzten Tage für /api/metadaten."""
    ab = time.time() - tage * 86400
    with closing(mdb()) as c:
        q = lambda sql: [dict(r) for r in c.execute(sql, (ab,))]
        return {"tage": tage,
                "api": q("SELECT endpunkt, COUNT(*) AS anfragen, SUM(credits) AS credits, SUM(cache!='neu') AS aus_cache, SUM(fehler!='') AS fehler, "
                         "CAST(AVG(ms) AS INTEGER) AS ms_schnitt FROM api WHERE zeit>=? GROUP BY endpunkt"),
                "ollama": q("SELECT modell, aufgabe, COUNT(*) AS anfragen, CAST(AVG(ms) AS INTEGER) AS ms_schnitt, SUM(tokens_ein) AS tokens_ein, SUM(tokens_aus) AS tokens_aus, "
                            "ROUND(AVG(NULLIF(tokens_s,0)),1) AS tokens_s, SUM(versuche>1) AS wiederholt, SUM(fehler!='') AS fehler FROM ollama WHERE zeit>=? GROUP BY modell, aufgabe"),
                "rezepte": q("SELECT COUNT(*) AS laeufe, SUM(quelle='hellofresh') AS hellofresh, CAST(AVG(zutaten) AS INTEGER) AS zutaten_schnitt, "
                             "CAST(AVG(ende-start) AS INTEGER) AS s_schnitt, SUM(fehler!='') AS fehler FROM rezept WHERE start>=?"),
                "stufen": q("SELECT stufe, COUNT(*) AS anzahl FROM zutat WHERE zeit>=? AND zweck='zutat' GROUP BY stufe ORDER BY anzahl DESC"),
                "ersatz": q("SELECT COUNT(*) AS vorschlaege, SUM(ok) AS ok, SUM(unsicher) AS unsicher, SUM(mischung) AS mischungen FROM ersatz WHERE zeit>=?")}

STANDARD_MS = {"extrahieren": 60000, "zutat": 8000, "ersatz": 30000, "ersatz_suche": 4000}  # grobe Startwerte, solange keine Erfahrung vorliegt
def _median(werte):
    w = sorted(x for x in werte if x and x > 0)
    return w[len(w) // 2] if w else None

def schaetzung(modell=""):
    """Typische Dauer je Schritt (Median der letzten 30 Messungen) für die Restzeit auf der Hauptseite; ohne Messungen grobe Startwerte."""
    try:
        with closing(mdb()) as c:
            ms = lambda sql, *a: [r[0] for r in c.execute(sql + " ORDER BY zeit DESC LIMIT 30", a)]
            ext = ms("SELECT ms FROM ollama WHERE aufgabe='extrahieren' AND fehler='' AND modell=?", modell) or ms("SELECT ms FROM ollama WHERE aufgabe='extrahieren' AND fehler=''")
            werte = {"extrahieren": ext, "zutat": ms("SELECT ms FROM zutat WHERE zweck='zutat' AND stufe!='fehler'"),
                     "ersatz": ms("SELECT ms FROM ersatz WHERE grund=''"), "ersatz_suche": ms("SELECT ms FROM zutat WHERE zweck IN ('ersatz','mischung')")}
            zut = [r[0] for r in c.execute("SELECT zutaten FROM rezept WHERE fehler='' ORDER BY start DESC LIMIT 30")]
    except sqlite3.Error: werte, zut = {}, []
    out = {k: _median(werte.get(k, [])) or d for k, d in STANDARD_MS.items()}
    out["messungen"] = {k: len(werte.get(k, [])) for k in STANDARD_MS}
    out["zutaten_schnitt"] = _median(zut) or 10
    return out


def _p(werte, q):  # Quantil (q zwischen 0 und 1) einer Liste, None bei leerer Liste
    w = sorted(x for x in werte if x is not None)
    return w[min(len(w) - 1, int(q * len(w)))] if w else None

def _gruppen(rows, schluessel):
    g = {}
    for r in rows: g.setdefault(tuple(r[k] for k in schluessel), []).append(r)
    return g

def _schnitt(werte, stellen=None):
    w = [x for x in werte if x]
    if not w: return None
    s = sum(w) / len(w)
    return round(s, stellen) if stellen else int(s)

STUFE_TEXT = {"standard": "Standardzutat", "grund": "Grundzutat", "erinnerung": "aus Erinnerung", "db": "Produktdatenbank", "uebersetzung": "Übersetzung + Datenbank",
              "api": "API.SH", "api_uebersetzung": "API.SH mit Übersetzung", "keine": "keine Treffer", "fehler": "Fehler"}
AUFGABE_TEXT = {"extrahieren": "Rezept extrahieren", "auswahl": "Produkt auswählen", "ersatz": "Ersatz vorschlagen", "test": "Verbindungstest"}
def _de(x, stellen=0): return f"{x:,.{stellen}f}".replace(",", " ").replace(".", ",").replace(" ", ".")

def seite(tage=30, limit=800):
    """Alle Auswertungen für die Seite /metadaten. tage=0 heißt: gesamter Zeitraum."""
    import calendar
    from datetime import date
    ab = time.time() - tage * 86400 if tage else 0
    heute = date.today(); monat_ab = time.mktime(heute.replace(day=1).timetuple())
    with closing(mdb()) as c:
        alle = lambda sql, *a: [dict(r) for r in c.execute(sql, a)]
        api_r = alle("SELECT * FROM api WHERE zeit>=? ORDER BY zeit", ab)
        oll_r = alle("SELECT * FROM ollama WHERE zeit>=? ORDER BY zeit", ab)
        rez_r = alle("SELECT * FROM rezept WHERE start>=? ORDER BY start", ab)
        zut_r = alle("SELECT * FROM zutat WHERE zeit>=? ORDER BY zeit", ab)
        ers_r = alle("SELECT * FROM ersatz WHERE zeit>=? ORDER BY zeit", ab)
        credits_monat = c.execute("SELECT COALESCE(SUM(credits),0) FROM api WHERE zeit>=?", (monat_ab,)).fetchone()[0]
        erste = c.execute("SELECT MIN(z) FROM (SELECT MIN(zeit) z FROM api UNION ALL SELECT MIN(zeit) FROM ollama UNION ALL SELECT MIN(start) FROM rezept)").fetchone()[0]

    ok_laeufe = [r for r in rez_r if not r["fehler"]]
    dauer_lauf = [int((r["ende"] - r["start"]) * 1000) for r in ok_laeufe]
    api_ok = [r for r in api_r if not r["fehler"]]
    oll_ok = [r for r in oll_r if not r["fehler"]]
    zutaten = [r for r in zut_r if r["zweck"] == "zutat"]
    tage_monat = calendar.monthrange(heute.year, heute.month)[1]

    ollama = []
    for (m, a), rs in sorted(_gruppen(oll_r, ("modell", "aufgabe")).items()):
        ok = [r for r in rs if not r["fehler"]]; ms = [r["ms"] for r in ok]
        ollama.append({"modell": m, "aufgabe": a, "anfragen": len(rs), "fehler": len(rs) - len(ok), "wiederholt": sum(1 for r in rs if r["versuche"] > 1),
                       "json_einfach": sum(r["json_einfach"] for r in rs), "ms_schnitt": _schnitt(ms), "ms_median": _p(ms, .5), "ms_p90": _p(ms, .9),
                       "ms_max": max(ms) if ms else None, "ms_laden": _p([r["ms_laden"] for r in ok if r["ms_laden"]], .5),
                       "tokens_ein": _schnitt([r["tokens_ein"] for r in ok]) or 0, "tokens_aus": _schnitt([r["tokens_aus"] for r in ok]) or 0,
                       "tokens_s": _schnitt([r["tokens_s"] for r in ok], 1) or 0})
    api = []
    for (e,), rs in sorted(_gruppen(api_r, ("endpunkt",)).items()):
        ok = [r for r in rs if not r["fehler"]]; neu = [r["ms"] for r in ok if r["cache"] == "neu"]
        api.append({"endpunkt": e, "anfragen": len(rs), "credits": sum(r["credits"] for r in rs), "aus_cache": sum(1 for r in ok if r["cache"] != "neu"),
                    "fehler": len(rs) - len(ok), "ms_median": _p(neu, .5), "ms_p90": _p(neu, .9),
                    "treffer_schnitt": round(sum(r["anzahl"] for r in ok) / len(ok), 1) if ok else 0})
    stufen = [{"stufe": s, "anzahl": len(rs), "ms_median": _p([r["ms"] for r in rs], .5)}
              for (s,), rs in sorted(_gruppen(zutaten, ("stufe",)).items(), key=lambda x: -len(x[1]))]
    gruende = {}
    for r in ers_r:
        for g in filter(None, (r["grund"] or "").split("; ")): gruende[g] = gruende.get(g, 0) + 1

    pro_tag = {}
    tag = lambda t: time.strftime("%Y-%m-%d", time.localtime(t))
    for r in api_r: pro_tag.setdefault(tag(r["zeit"]), {"credits": 0, "laeufe": 0})["credits"] += r["credits"]
    for r in rez_r: pro_tag.setdefault(tag(r["start"]), {"credits": 0, "laeufe": 0})["laeufe"] += 1

    ohne = {}
    for r in zutaten:
        if r["stufe"] == "keine": ohne[r["zutat"]] = ohne.get(r["zutat"], 0) + 1

    letzte = [{"zeit": r["zeit"], "art": "API.SH", "was": f"{r['endpunkt']} {r['begriff']}".strip(), "ms": r["ms"], "fehler": bool(r["fehler"]),
               "info": r["fehler"] or (f"{r['credits']} Credit(s), {r['anzahl']} Treffer" if r["cache"] == "neu" else "aus Zwischenspeicher, 0 Credits")} for r in api_r[-40:]]
    letzte += [{"zeit": r["zeit"], "art": "Ollama", "was": f"{AUFGABE_TEXT.get(r['aufgabe'], r['aufgabe'] or 'Anfrage')} · {r['modell']}", "ms": r["ms"], "fehler": bool(r["fehler"]),
                "info": r["fehler"] or f"{_de(r['tokens_ein'])} → {_de(r['tokens_aus'])} Tokens, {_de(r['tokens_s'], 1)} Tokens/s"} for r in oll_r[-40:]]
    letzte += [{"zeit": r["zeit"], "art": "Zutat", "was": r["zutat"], "ms": r["ms"], "fehler": r["stufe"] == "fehler",
                "info": STUFE_TEXT.get(r["stufe"], r["stufe"]) + (f", Begriff „{r['begriff']}“" if r["begriff"] else "") + ("" if r["zweck"] == "zutat" else f" (für {r['zweck']})")} for r in zut_r[-40:]]

    return {"tage": tage, "erste": erste, "limit": limit,
            "kennzahlen": {"laeufe": len(rez_r), "laeufe_fehler": len(rez_r) - len(ok_laeufe), "ms_lauf_median": _p(dauer_lauf, .5), "ms_lauf_schnitt": _schnitt(dauer_lauf),
                           "ms_lauf_max": max(dauer_lauf) if dauer_lauf else None, "zutaten_schnitt": _schnitt([r["zutaten"] for r in ok_laeufe], 1),
                           "credits": sum(r["credits"] for r in api_r), "credits_monat": credits_monat,
                           "credits_prognose": round(credits_monat / heute.day * tage_monat) if credits_monat else 0,
                           "api_anfragen": len(api_r), "api_fehler": len(api_r) - len(api_ok), "aus_cache": sum(1 for r in api_ok if r["cache"] != "neu"),
                           "zutaten_gesucht": len(zutaten), "ohne_api": sum(1 for r in zutaten if r["stufe"] in OHNE_API),
                           "ollama_anfragen": len(oll_r), "ollama_fehler": len(oll_r) - len(oll_ok), "ollama_ms_median": _p([r["ms"] for r in oll_ok], .5),
                           "ollama_ms_summe": sum(r["ms"] for r in oll_ok), "tokens_s": _schnitt([r["tokens_s"] for r in oll_ok], 1) or 0,
                           "ersatz": len(ers_r), "ersatz_ok": sum(r["ok"] for r in ers_r), "ersatz_unsicher": sum(r["unsicher"] for r in ers_r),
                           "ersatz_mischung": sum(r["mischung"] for r in ers_r), "ersatz_ms_median": _p([r["ms"] for r in ers_r if r["ok"]], .5)},
            "ollama": ollama, "api": api, "stufen": stufen, "gruende": sorted(gruende.items(), key=lambda x: -x[1])[:6],
            "pro_tag": [{"tag": k, **v} for k, v in sorted(pro_tag.items())][-31:],
            "langsamste": sorted(({"zutat": r["zutat"], "stufe": r["stufe"], "ms": r["ms"]} for r in zutaten), key=lambda x: -x["ms"])[:5],
            "verlauf": [{"zeit": r["start"], "gesucht": r["zutaten_gesucht"], "ohne_api": r["ohne_api"]} for r in ok_laeufe if r["zutaten_gesucht"]][-100:],
            "ohne_treffer": sorted(ohne.items(), key=lambda x: -x[1])[:8], "letzte": sorted(letzte, key=lambda x: -x["zeit"])[:40]}
