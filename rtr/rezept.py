"""Rezept auslesen, Mengen erkennen, Ersatz vorschlagen und mit Links anreichern."""
import json, re, time
from . import apish, metadaten, modell, woerter
from .config import Err, ascii_, get_key, norm, settings
from .protokoll import note

STR = {"type": "string"}
S_EXT = {"type": "object", "required": ["rezeptname", "portionen", "zutaten", "schritte"], "properties": {
    "rezeptname": STR, "portionen": STR, "schritte": {"type": "array", "items": STR},
    "zutaten": {"type": "array", "items": {"type": "object", "required": ["text", "menge", "einheit", "name"],
        "properties": {"text": STR, "menge": STR, "einheit": STR, "name": STR}}}}}
S_SUB = {"type": "object", "required": ["original", "ersatz", "menge", "mischung", "begruendung", "schritte", "ernaehrungsform", "sicher"], "properties": {
    "original": STR, "ersatz": STR, "mischung": STR, "menge": STR, "begruendung": STR, "sicher": {"type": "boolean"},
    "ernaehrungsform": {"type": "string", "enum": ["ja", "nein", "unbekannt"]},
    "schritte": {"type": "array", "items": {"type": "object", "required": ["nr", "hinweis"],
        "properties": {"nr": {"type": "integer"}, "hinweis": STR}}}}}
BAD = re.compile(r"€|\beuro\b|\bpreis(e|es|en)?\b|vorrätig|auf lager|im angebot", re.I)

def numbered_steps(text):  # nummerierte Schritte stammen aus dem Text, nicht vom Modell
    out, cur = [], False
    for l in text.splitlines():
        m = re.match(r"\s*\d+[.)]\s+(\S.*)", l)
        if m: out.append(m.group(1).strip()); cur = True
        elif cur and l.strip() and not l.rstrip().endswith(":"): out[-1] += " " + l.strip()
        else: cur = False
    return out

UNITS = (r"(?:kg|mg|g|ml|cl|l|el|tl|stück|stk\.?|pck\.?|pkg\.?|päckchen|packung(?:en)?|dose(?:n)?|bund|zehe(?:n)?|prise(?:n)?|becher|scheibe(?:n)?|msp\.?|tasse(?:n)?|gläser|glas|kopf|stange(?:n)?|zweig(?:e)?|handvoll|beutel|flasche(?:n)?)")
NUM = r"(?:\d+\s+\d+/\d+|\d+\s*/\s*\d+|\d+(?:[.,]\d+)?|[½¼¾])"
AMT = re.compile(r"^\s*(?:ca\.?\s*|etwa\s*)?(" + NUM + r"(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(" + UNITS + r")?(?=[\s,.;)]|$)", re.I)
AMT_END = re.compile(r"(\d+(?:[.,]\d+)?)\s*(" + UNITS + r")\s*$", re.I)
def parse_amount(text):
    m = AMT.match(text or "") or AMT_END.search(text or "")
    return (re.sub(r"\s+", " ", m.group(1)).strip(), m.group(2) or "") if m else ("", "")

def extract(text, quelle="text"):
    """Wie _extract; legt zusätzlich einen Rezeptlauf in metadaten.db an. Dessen Nummer ("lauf") schickt die Seite bei den Folgeschritten mit."""
    t0 = time.time()
    try: r = _extract(text)
    except Err as e: metadaten.rezept_start(quelle, 0, 0, 0, int((time.time() - t0) * 1000), str(e)[:200]); raise
    return {**r, "lauf": metadaten.rezept_start(quelle, len(r["zutaten"]), len(r["schritte"]), len(r["warnungen"]), int((time.time() - t0) * 1000))}

def _extract(text):
    if len(text) < 50: raise Err("Bitte den vollständigen Rezepttext einfügen (mindestens 50 Zeichen).")
    if len(text) > 8000: raise Err("Der Text ist zu lang (max. 8.000 Zeichen). Bitte Werbetexte oder Nährwerte entfernen.")
    r = modell.llm(modell.prompt("extrahieren"), text, S_EXT, "extrahieren")
    z = [x for x in r["zutaten"] if x["name"].strip()]
    r["schritte"] = numbered_steps(text) or r["schritte"]
    for x in z:  # Mengen kommen aus dem Originaltext, nicht aus dem Modell
        m, u = parse_amount(x["text"])
        if m: x["menge"], x["einheit"] = m, u
        elif re.sub(r"\D", "", x["menge"]) not in re.sub(r"\D", "", x["text"]): x["menge"], x["einheit"] = "", ""
    if not z or not r["schritte"]: raise Err("Es wurden keine Zutaten oder Schritte erkannt. Bitte Text prüfen.")
    t, w = norm(text), []
    w += [f"Zutat nicht wörtlich im Originaltext gefunden: {x['text']}" for x in z if norm(x["text"]) not in t]
    return {**r, "zutaten": z, "warnungen": w}

def substitute(rz, i, bisher=(), lauf=None):
    """Wie _substitute; hält zusätzlich Ergebnis, Versuche und Grund in metadaten.db fest."""
    t0, name = time.time(), rz["zutaten"][i]["name"]
    try: r = _substitute(rz, i, bisher)
    except Err as e: metadaten.ersatz(lauf, name, False, False, False, 0, str(e)[:200], int((time.time() - t0) * 1000)); raise
    v = r.pop("_versuche")
    metadaten.ersatz(lauf, name, r["ok"], r["unsicher"], bool(r["mischung"].strip()), v, r["grund"], int((time.time() - t0) * 1000)); return r

def _substitute(rz, i, bisher=()):
    z = rz["zutaten"][i]
    steps = "\n".join(f"{n + 1}. {t}" for n, t in enumerate(rz["schritte"]))
    others = ", ".join(x["name"] for j, x in enumerate(rz["zutaten"]) if j != i)
    base = (f"ZU ERSETZENDE ZUTAT: {z['text']} (Menge laut Rezept: {((z.get('menge') or '') + ' ' + (z.get('einheit') or '')).strip() or 'keine Angabe'})\nRezept: {rz['rezeptname']} (Portionen: {rz.get('portionen') or 'unbekannt'})\n"
            f"Übrige Zutaten (nur Kontext, NICHT ersetzen): {others}\nSchritte:\n{steps}")
    words = re.findall(r"\w{4,}", ascii_(z["name"] + " " + z["text"])), {norm(x) for x in bisher}
    hint = ""
    for versuche in range(1, 3):  # höchstens ein Wiederholversuch bei falscher Zutat oder doppeltem Ersatz
        r = modell.llm(modell.prompt("ersatz"), base + hint, S_SUB, "ersatz")
        passt = any(w in ascii_(r["original"]) for w in words[0]) if words[0] else True
        dup = norm(r["ersatz"]) in words[1]
        if passt and not dup: break
        hint = "\nACHTUNG, die letzte Antwort war falsch. " + (f"Ersetze ausschließlich '{z['text']}', keine andere Zutat. " if not passt else "") \
               + (f"Der Ersatz '{r['ersatz']}' ist schon für eine andere Zutat vergeben ({', '.join(bisher)}). Nenne einen anderen. " if dup else "")
    if not r["menge"].strip(): r["menge"] = ((z.get("menge") or "") + " " + (z.get("einheit") or "")).strip() or "nach Geschmack"
    r["schritte"] = [t for t in r["schritte"] if 1 <= t["nr"] <= len(rz["schritte"])]  # ungültige Schrittnummern entfallen, der Ersatz bleibt
    g = []
    if not passt: g.append("Das Modell hat eine andere Zutat als die gesuchte ersetzt")
    if dup: g.append("Das Modell schlug denselben Ersatz wie bei einer anderen Zutat vor")
    if not r["ersatz"].strip() or norm(r["ersatz"]) == norm(z["name"]): g.append("Das Modell nannte keinen echten Ersatz")
    if r["ernaehrungsform"] == "nein": g.append("Der Ersatz passt nicht zur Ernährungsform des Rezepts")
    if BAD.search(json.dumps(r, ensure_ascii=False)): g.append("Die Antwort enthielt Preis- oder Verfügbarkeitsangaben")
    return {**r, "ok": not g, "grund": "; ".join(g), "unsicher": (not r["sicher"]) or r["ernaehrungsform"] == "unbekannt", "_versuche": versuche}

def mix_namen(m):
    out = []
    for t in re.split(r",|;|\+|\bund\b", m):
        t = re.sub(r"^\s*(?:ca\.?\s*)?(?:" + NUM + r")?\s*(?:" + UNITS + r")?\s*(?:von\s+|vom\s+)?", "", t.strip(), flags=re.I).strip(" .")
        if t and t.lower() not in [o.lower() for o in out]: out.append(t)
    return out[:4]

def anreichern(r, z_name="", lauf=None):
    """Links zum Ersatz: Produktsuche (Datenbank zuerst) für den Ersatz bzw. die Einzelgewürze einer Mischung."""
    if not (r["ok"] and settings()["stufe2"] and get_key()[0]): return r
    try:
        if r["mischung"].strip():
            r["mix_produkte"] = []
            for n in mix_namen(r["mischung"]):
                p = apish.products(n, details=False, lauf=lauf, zweck="mischung"); k = p["kandidaten"][p["wahl"]] if p.get("wahl", -1) >= 0 else None
                r["mix_produkte"].append({"name": n, "produkt": k, "standard": (p.get("standard") or {}).get("name")})
        else:
            r["produkt"] = apish.products(r["ersatz"], lauf=lauf, zweck="ersatz")
            if r["produkt"].get("wahl", -1) >= 0 and not r["produkt"].get("erinnerung"): woerter.begriff_merken(z_name, r["ersatz"], "modell")
    except Err as e: note("Ersatz-Produktsuche", f"{e} (der Ersatz wird ohne Link gezeigt)", "error")
    return r
