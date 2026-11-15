"""Protokoll für die Prozessanzeige (/status): jeder Schritt wird mit Art, Dauer und Ergebnis festgehalten."""
import collections, threading, time

LOG, _V, _lock = collections.OrderedDict(), [0], threading.Lock()
def ev(step, state="run", detail="", **x):
    with _lock:
        _V[0] += 1; i = _V[0]
        LOG[i] = {"id": i, "v": i, "t": time.strftime("%H:%M:%S"), "t0": time.time(), "step": step, "state": state, "detail": detail, "ms": None, **x}
        while len(LOG) > 300: LOG.popitem(last=False)
    return i
def end(i, state="ok", detail="", **x):
    with _lock:
        e = LOG.get(i)
        if e:
            _V[0] += 1; e.update(v=_V[0], state=state, ms=int((time.time() - e["t0"]) * 1000))
            if detail: e["detail"] = detail
            e.update(x)

def prog(i, detail):  # Fortschritt eines laufenden Schritts (Prozessseite und Hauptseite zeigen ihn live)
    with _lock:
        e = LOG.get(i)
        if e: _V[0] += 1; e.update(v=_V[0], detail=detail)

def note(step, detail, state="ok", **x): end(ev(step, "run", detail, **x), state, detail, **x)
