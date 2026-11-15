"""API.SH (REWE-Daten): Marktsuche, Produktsuche, Produktdetails; zuerst wird die Datenbank gefragt."""
import json, os, re, time, urllib.error, urllib.parse, urllib.request
from contextlib import closing
from datetime import date
from . import metadaten, modell
from .config import Err, UA, ascii_, get_key, jload, jsave, settings
from .datenbank import db, db_kandidaten, db_speichern, gueltig, prow
from .standard import standard_info
from .protokoll import end, ev, note
from . import woerter

API = os.environ.get("APISH_URL", "https://api.api.sh/rewe/v1")

def _api(path, params, ttl):
    key, _ = get_key()
    if not key: raise Err("Kein API-Schlüssel gefunden. In der Datei .env (im Programmordner) eintragen: APISH_KEY=dein-schluessel")
    k = path + "?" + urllib.parse.urlencode(sorted(params.items()))
    c = jload("cache.json", {})
    if k in c and time.time() - c[k]["t"] < ttl: return c[k]["d"], c[k]["t"], True
    cr, mon = jload("credits.json", {}), date.today().strftime("%Y-%m")
    if cr.get("monat") != mon: cr = {"monat": mon, "verbraucht": 0}
    if cr["verbraucht"] >= settings()["limit"]: raise Err("Monatslimit für Credits erreicht. Bis zum Monatswechsel bleibt Stufe 1.")
    try:
        rq = urllib.request.Request(API + path + "?" + urllib.parse.urlencode(params), headers={"x-api-key": key, "User-Agent": UA})
        with urllib.request.urlopen(rq, timeout=30) as f: d = json.loads(f.read())
    except urllib.error.HTTPError as e:
        try: why = json.loads(e.read()).get("error", "")
        except Exception: why = ""
        raise Err({401: "API-Schlüssel ungültig.", 402: "Bei API.SH sind keine Credits mehr verfügbar."}.get(e.code, f"API.SH-Fehler {e.code}: {why}"))
    except OSError: raise Err("API.SH nicht erreichbar.")
    d.pop("raw", None); cr["verbraucht"] += d.get("credits_used", 1); jsave("credits.json", cr)
    if ttl: c[k] = {"t": time.time(), "d": d}; jsave("cache.json", c)
    return d, time.time(), False

def api(path, params, ttl):
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    i = ev(f"API.SH {path}", "run", f"GET {url}", kind="api", endpoint=path, params=params, credits=0, cache="")
    t0, begriff = time.time(), str(params.get("q") or params.get("id") or "")
    try: d, t, hit = _api(path, params, ttl)
    except Err as e:
        end(i, "error", f"GET {url}\nFehler: {e}"); metadaten.api(path, begriff, 0, "", int((time.time() - t0) * 1000), 0, str(e)); raise
    if path == "/product": n, erg = 1, f"Produkt {params.get('id')}: {(d.get('name') or '')[:70]}"
    else:
        n = len(d.get("items") or d.get("markets") or []); erg = f"{n} Ergebnis(se)" + (f" von insgesamt {d['total']}" if d.get("total") else "")
    if hit: cache, cr, txt = "lokal", 0, "NICHT gesendet: aus dem lokalen Zwischenspeicher, 0 Credits"
    elif d.get("cached") and not d.get("credits_used"): cache, cr, txt = "api", 0, "an API.SH gesendet, dort aus deren Zwischenspeicher beantwortet: 0 Credits laut Antwort"
    else: cache, cr, txt = "", d.get("credits_used", 1), f"an API.SH gesendet: {d.get('credits_used', 1)} Credit(s) laut Antwort"
    end(i, "ok", f"GET {url}\nErgebnis: {erg} · {txt}", credits=cr, cache=cache, anzahl=n)
    metadaten.api(path, begriff, cr, cache, int((time.time() - t0) * 1000), n); return d, t

def markets(q):
    if not q.strip(): raise Err("Bitte Postleitzahl oder Ort eingeben.")
    d, _ = api("/markets", {"q": q.strip(), "limit": 20}, 7 * 86400)
    return [{k: m.get(k) for k in ("id", "name", "street", "postcode", "city", "pickup", "open_status", "url")} for m in d.get("markets", [])]

def details(pid):
    """Marke, Packungsgröße, Kategorien: aus der Datenbank, sonst über /product (1 Credit) und dann speichern."""
    with closing(db()) as c:
        r = c.execute("SELECT * FROM produkte WHERE id=?", (str(pid),)).fetchone()
        if r and r["details_stand"] and time.time() - r["details_stand"] < gueltig():
            note("Datenbank", f"Details zu {pid} aus der Datenbank, keine API-Anfrage", kind="db", art="details"); return prow(r)
    d, _ = api("/product", {"id": str(pid)}, 0)
    kat = " › ".join(x.get("name", "") for x in (d.get("categories") or []) if isinstance(x, dict))
    now = time.time(); img = (d.get("images") or [""])[0]
    with closing(db()) as c:
        c.execute("INSERT INTO produkte(id,name,url,image,marke,packung,kategorien,gesehen,details_stand) VALUES(?,?,?,?,?,?,?,?,?) "
                  "ON CONFLICT(id) DO UPDATE SET marke=excluded.marke,packung=excluded.packung,kategorien=excluded.kategorien,details_stand=excluded.details_stand",
                  (str(pid), d.get("name", ""), d.get("url", ""), img, d.get("brand") or "", d.get("grammage") or "", kat, now, now))
        c.commit(); return prow(c.execute("SELECT * FROM produkte WHERE id=?", (str(pid),)).fetchone())

def _top(raw, words):
    sc = lambda i: sum(w in ascii_(i["name"]) for w in words)
    return sorted((i for i in raw if sc(i)), key=lambda i: -sc(i))[:5]

def _worte(t): return re.findall(r"\w{4,}", ascii_(t)) or [ascii_(t)]

def _lokal(term):
    """Nur die Produktdatenbank fragen. Rückgabe: (Kandidaten, schon_gesucht, Quelle); schon_gesucht heißt: gültiger Eintrag da, auch wenn ohne Treffer."""
    words = _worte(term); raw, quelle = db_kandidaten(term, words)
    if raw is None:
        note("Datenbank", f"kein gültiger Eintrag für '{term}' in der Produktdatenbank", "warn", kind="db", art="lokal-leer", begriff=term); return [], False, ""
    cand = _top(raw, words)
    note("Datenbank", f"{len(cand)} passende Produkte für '{term}' – {quelle}, keine API-Suche", kind="db", art="treffer" if cand else "lokal-leer", anzahl=len(cand), begriff=term)
    return cand, True, quelle

def _api_suche(term):
    note("Datenbank", f"'{term}' nicht in der Produktdatenbank – API wird gefragt", "warn", kind="db", art="miss", begriff=term)
    d, _ = api("/search", {"q": term}, 0)
    items = [{k: i.get(k, "") for k in ("id", "name", "url", "image")} for i in d.get("items", [])]
    neu = db_speichern(term, items); now = time.time()
    note("Datenbank", f"{len(items)} Produkte zu '{term}' gespeichert, davon {neu} neu", kind="db", art="gespeichert", neu=neu, anzahl=len(items), begriff=term)
    return _top([{**i, "id": str(i["id"]), "marke": "", "packung": "", "kategorien": "", "gesehen": now} for i in items], _worte(term))

def _waehlen(name, orig, cand, quelle, details):
    """Das Modell wählt aus höchstens 5 Kandidaten; Details nachladen; Auswahl in der Wortdatenbank merken."""
    liste = "\n".join(f"{i}: {c['name']}" for i, c in enumerate(cand))
    r = modell.llm(modell.prompt("auswahl"), f"Zutat: {name}\nProdukte:\n{liste}",
            {"type": "object", "required": ["wahl"], "properties": {"wahl": {"type": "integer"}}}, "auswahl")
    wahl = r["wahl"] if 0 <= r["wahl"] < len(cand) else -1
    if wahl >= 0 and settings()["details_auto"] and details:
        try: cand[wahl] = globals()["details"](cand[wahl]["id"])
        except Err as e: note("Produktdetails", f"{e} (das Produkt wird ohne Details gezeigt)", "error")
    if wahl >= 0: woerter.merken(orig, cand[wahl], "modell")
    ref = cand[wahl]["gesehen"] if wahl >= 0 else cand[0]["gesehen"]
    return {"kandidaten": cand, "wahl": wahl, "stand": date.fromtimestamp(ref or time.time()).isoformat(), "quelle": quelle}

def products(name, details=True, lauf=None, zweck="zutat"):
    """Produktsuche wie _products; hält zusätzlich den Weg der Zutat in metadaten.db fest (zweck: zutat, ersatz oder mischung)."""
    t0, q = time.time(), re.sub(r"\(.*?\)", "", name).strip().lower()
    ms = lambda: int((time.time() - t0) * 1000)
    try: r = _products(name, details)
    except Err as e: metadaten.zutat(lauf, zweck, q, "fehler", "", 0, False, ms()); raise
    metadaten.zutat(lauf, zweck, q, r.get("stufe", ""), r.get("begriff", ""), len(r.get("kandidaten") or []), r.get("wahl", -1) >= 0 or bool(r.get("standard")), ms())
    return r

def _products(name, details=True):
    """Reihenfolge: 1 Standardzutaten (standard.db) → Erinnerung (Auswahl aus früheren Läufen) → 2 Produktdatenbank mit dem Originalnamen →
    3 Wortdatenbank (Übersetzung in andere Begriffe) → 4 Produktdatenbank mit den neuen Begriffen → 5 API.SH → sonst kein Treffer (dann schlägt Ollama einen Ersatz vor)."""
    q = re.sub(r"\(.*?\)", "", name).strip().lower()
    std = standard_info(q) if q else None
    if std:
        note("Standardzutaten", f"'{q}' ist eine Standardzutat ({std['name']}) – keine Suche, keine API-Anfrage", kind="db", art="standard", begriff=q)
        return {"uebersprungen": True, "standard": std, "kandidaten": [], "stufe": "standard"}
    if not q or q in settings()["grund"]: return {"uebersprungen": True, "kandidaten": [], "stufe": "grund"}
    mem = woerter.erinnern(q)
    if mem:  # früher gewähltes Produkt (Nutzer vor Modell): sofort übernehmen, weder Modell noch API
        k = db_produkt(mem["id"]) or {"id": mem["id"], "name": mem["name"], "url": mem["url"], "image": mem["image"], "marke": "", "packung": "", "kategorien": "", "gesehen": 0}
        raw, _ = db_kandidaten(q, _worte(q))  # nur lokal, für „Anderes Produkt wählen“
        rest = [i for i in (raw or []) if str(i["id"]) != str(mem["id"])][:4]
        herkunft = ("deine Auswahl" if mem["quelle"] == "nutzer" else "früherer Treffer") + mem["via"]
        note("Wortdatenbank", f"'{q}' → {k['name']} aus Erinnerung ({herkunft}), kein Modell, keine API-Anfrage", kind="db", art="erinnerung", begriff=q)
        return {"kandidaten": [k] + rest, "wahl": 0, "stand": date.today().isoformat(), "quelle": "aus Erinnerung: " + herkunft, "erinnerung": True, "stufe": "erinnerung"}
    cand, gesucht, quelle = _lokal(q); bekannt = {q: gesucht}
    if cand: return {**_waehlen(name, q, cand, quelle, details), "stufe": "db"}
    terms = [t for t in woerter.alternativen(q) if t != q][:3]
    note("Wortdatenbank", f"'{q}' übersetzt in: {', '.join(terms)}" if terms else f"keine Übersetzung für '{q}' bekannt", "ok" if terms else "warn", kind="db", art="woerter", begriff=q)
    for t in terms:
        cand, bekannt[t], quelle = _lokal(t)
        if cand:
            note("Wortdatenbank", f"Begriff '{t}' statt '{q}' führte in der Produktdatenbank zum Treffer", kind="db", art="alternativ", begriff=q)
            return {**_waehlen(name, q, cand, f"{quelle}, Begriff „{t}“", details), "stufe": "uebersetzung", "begriff": t}
    for t in [q] + terms[:2]:
        if bekannt.get(t): continue  # gültiger Eintrag ohne Treffer: nicht noch einmal bezahlen
        cand = _api_suche(t)
        if cand:
            if t != q: woerter.begriff_merken(q, t, "api")
            return {**_waehlen(name, q, cand, "API.SH" + (f", Begriff „{t}“" if t != q else ""), details), "stufe": "api_uebersetzung" if t != q else "api", "begriff": t if t != q else ""}
    return {"kandidaten": [], "wahl": -1, "stand": date.today().isoformat(), "quelle": "keine Treffer", "stufe": "keine"}

def db_produkt(pid):
    with closing(db()) as c:
        r = c.execute("SELECT * FROM produkte WHERE id=?", (str(pid),)).fetchone()
        return prow(r) if r else None
