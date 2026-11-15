"""HelloFresh-Rezeptseite laden (höflich: robots.txt, Pause zwischen Anfragen, keine Umgehung von Sperren)."""
import json, re, time, urllib.error, urllib.parse, urllib.request, urllib.robotparser
from html import unescape
from .config import Err, UA
from .protokoll import end, ev

_last, _robots, _blocked = [0.0], {}, {}

def _fetch(url):
    host = urllib.parse.urlparse(url).netloc
    if time.time() - _blocked.get(host, 0) < 86400: raise Err(f"{host} blockiert automatisierte Abrufe (zuletzt festgestellt, es wird 24 Stunden lang nicht erneut versucht).")
    if host not in _robots:
        rp = urllib.robotparser.RobotFileParser(f"https://{host}/robots.txt")
        try: rp.read()
        except OSError: raise Err(f"{host} nicht erreichbar.")
        _robots[host] = rp
    if not _robots[host].can_fetch(UA, url): raise Err(f"robots.txt von {host} verbietet den Abruf.")
    time.sleep(max(0, 3 - (time.time() - _last[0])))  # höchstens eine Anfrage alle 3 Sekunden
    _last[0] = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "de"}), timeout=20) as f:
            return f.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:  # keine Umgehung bei Sperren
        if e.code in (403, 429): _blocked[host] = time.time()
        raise Err(f"{host} blockiert automatisierte Abrufe (HTTP {e.code}). Bitte den Rezepttext einfügen.")
    except OSError: raise Err(f"{host} nicht erreichbar.")

def fetch(url):
    u = urllib.parse.urlparse(url); i = ev(f"Abruf {u.netloc}", "run", u.path[:80], kind="fetch")
    try: r = _fetch(url)
    except Err as e: end(i, "error", str(e)); raise
    end(i, "ok", f"{len(r)} Zeichen geladen"); return r

def recipe_from_url(u):
    p = urllib.parse.urlparse(u)
    if p.scheme != "https" or not re.search(r"(^|\.)hellofresh\.(de|com|at|ch)$", p.netloc):
        raise Err("Bitte eine HelloFresh-Rezept-URL einfügen (https://www.hellofresh.de/recipes/...).")
    h = fetch(u)
    for m in re.finditer(r'<script[^>]+ld\+json[^>]*>(.*?)</script>', h, re.S):
        try: d = json.loads(m.group(1))
        except ValueError: continue
        for x in (d if isinstance(d, list) else d.get("@graph", [d])):
            if isinstance(x, dict) and "Recipe" in str(x.get("@type")):
                st = x.get("recipeInstructions", [])
                st = [t.get("text", "") if isinstance(t, dict) else str(t) for t in st] if isinstance(st, list) else [str(st)]
                y = x.get("recipeYield", ""); y = y[0] if isinstance(y, list) and y else y
                ing = [unescape(i) for i in x.get("recipeIngredient", [])]
                warn = "" if sum(bool(re.search(r"\d", i)) for i in ing) >= max(1, len(ing) / 2) else \
                    "Die geladenen Zutaten enthalten kaum Mengenangaben (HelloFresh liefert sie evtl. nicht in den eingebetteten Daten). Bitte die Zutatenliste mit Mengen von der Rezeptseite in das Textfeld einfügen."
                return "\n".join(filter(None, [unescape(x.get("name", "")), f"Portionen: {y}" if y else "", "Zutaten:", *ing, "Zubereitung:",
                    *[f"{n + 1}. {unescape(t)}" for n, t in enumerate(st) if t]])), warn
    raise Err("Auf der Seite wurden keine Rezeptdaten gefunden. Bitte den Rezepttext einfügen.")
