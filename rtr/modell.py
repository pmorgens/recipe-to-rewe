"""Lokales Sprachmodell über Ollama (Datenstrom, Geduld, verständliche Fehler)."""
import json, os, time, urllib.error, urllib.request
from . import metadaten
from .config import B, Err, settings
from .protokoll import end, ev, prog

OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")

def prompt(name):
    """Anweisungen für das Modell liegen als Textdateien in prompts/ und können ohne Neustart angepasst werden."""
    try: return (B / "prompts" / f"{name}.txt").read_text(encoding="utf-8").strip()
    except OSError: raise Err(f"Prompt-Datei fehlt: prompts/{name}.txt")

def ollama_fehlertext(e):
    try: return json.loads(e.read()).get("error", "") or e.reason
    except Exception: return str(e.reason)

def _llm(system, user, schema, i=None, info=None):
    info = info if info is not None else {}
    cfg = settings(); m = cfg["modell"]
    if not m: raise Err("Kein Modell gewählt.")
    timeout = cfg["timeout_s"]  # längste Pause ohne neues Zeichen vom Modell; solange es schreibt, wird gewartet
    def call(fmt, sysmsg):
        body = json.dumps({"model": m, "stream": True, "format": fmt, "options": {"temperature": 0.1, "num_ctx": 8192},
                           "messages": [{"role": "system", "content": sysmsg}, {"role": "user", "content": user}]}).encode()
        rq = urllib.request.Request(OLLAMA + "/api/chat", body, {"Content-Type": "application/json"})
        t0 = last = time.time(); teile, denk = [], 0
        with urllib.request.urlopen(rq, timeout=timeout) as f:
            for zeile in f:
                if time.time() - t0 > cfg["max_s"]: raise TimeoutError("max")
                if not zeile.strip(): continue
                c = json.loads(zeile)
                if c.get("error"): raise Err(f"Ollama meldet: {c['error']}")
                mm = c.get("message") or {}; teile.append(mm.get("content") or ""); denk += len(mm.get("thinking") or "")
                if i and time.time() - last > 2:
                    last = time.time()
                    prog(i, f"{user[:60].replace(chr(10), ' ')} – läuft seit {int(last - t0)} s, {sum(map(len, teile))} Zeichen erzeugt" + (f", denkt ({denk} Zeichen)" if denk else ""))
                if c.get("done"): info["werte"] = c; break  # letzte Antwort enthält Tokens und Zeiten
        r = json.loads("".join(teile))
        if not isinstance(r, dict) or any(k not in r for k in schema.get("required", [])): raise ValueError("Pflichtfelder fehlen")
        return r
    lahm = Err(f"Zeitüberschreitung: {timeout} Sekunden lang kam kein neues Zeichen vom Modell. Es lädt noch oder ist auf diesem Rechner zu langsam. "
               f"Ein kleineres Modell wählen oder in settings.json \"timeout_s\" erhöhen.")
    fmt, sysmsg, ungueltig = schema, system, 0
    for _ in range(3):
        info["versuche"] = info.get("versuche", 0) + 1
        try: return call(fmt, sysmsg)
        except (ValueError, KeyError):
            ungueltig += 1
            if ungueltig >= 2: break
        except TimeoutError as e: raise (Err(f"Die Höchstdauer von {cfg['max_s']} Sekunden ist überschritten (in settings.json \"max_s\" änderbar).") if str(e) == "max" else lahm)
        except urllib.error.HTTPError as e:
            msg = ollama_fehlertext(e)
            if e.code == 400 and fmt is schema:  # ältere Ollama-Versionen kennen kein JSON-Schema im Feld "format"
                info["json"] = True
                fmt, sysmsg = "json", system + "\nAntworte ausschließlich als JSON mit genau diesen Feldern: " + json.dumps(schema, ensure_ascii=False); continue
            if e.code == 404: raise Err(f"Ollama kennt das Modell „{m}“ nicht ({msg}). Mit „ollama list“ prüfen und im Programm ein installiertes Modell wählen.")
            raise Err(f"Ollama meldet Fehler {e.code}: {msg}" + (" Vermutlich reicht der Arbeitsspeicher, ein kleineres Modell wählen." if e.code >= 500 else ""))
        except urllib.error.URLError as e:
            if isinstance(e.reason, TimeoutError): raise lahm
            raise Err(f"Ollama ist unter {OLLAMA} nicht erreichbar ({e.reason}). Ollama starten.")
        except OSError as e: raise Err(f"Verbindung zu Ollama fehlgeschlagen: {e}")
    raise Err("Das Modell hat kein gültiges JSON mit allen Feldern geliefert. Bitte erneut versuchen oder ein größeres Modell wählen.")

def llm(system, user, schema, aufgabe=""):
    m = settings()["modell"]; info = {"werte": {}, "versuche": 0, "json": False}; t0 = time.time()
    i = ev(f"Lokales Modell ({m or '?'})", "run", user[:90].replace("\n", " "), kind="model")
    ms = lambda: int((time.time() - t0) * 1000)
    try: r = _llm(system, user, schema, i, info)
    except Err as e:
        end(i, "error", str(e)); metadaten.ollama(m, aufgabe, ms(), info["werte"], info["versuche"], info["json"], str(e)[:200], len(user)); raise
    end(i, "ok", f"{user[:60].replace(chr(10), ' ')} – fertig, {len(json.dumps(r, ensure_ascii=False))} Zeichen")
    metadaten.ollama(m, aufgabe, ms(), info["werte"], info["versuche"], info["json"], zeichen=len(user)); return r
