#!/usr/bin/env python3
"""Startet den Server und startet ihn bei Änderungen an den Python-Dateien automatisch neu.
Seiten (static/) und Prompts (prompts/) werden bei jedem Aufruf neu gelesen und brauchen keinen Neustart.
  python start.py                  mit automatischem Neustart
  python start.py --ohne-neustart  einfach starten"""
import signal, subprocess, sys, time
from pathlib import Path

B = Path(__file__).resolve().parent
def stand(): return {str(p): p.stat().st_mtime for p in [B / "server.py", *B.glob("rtr/*.py")]}

def main():
    auto = "--ohne-neustart" not in sys.argv
    signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))  # auch beim Beenden von außen den Server mit beenden
    child = None
    try:
        while True:
            s0 = stand(); child = subprocess.Popen([sys.executable, str(B / "server.py")])
            while child.poll() is None:
                time.sleep(1)
                if auto and stand() != s0:
                    print("Änderung erkannt – Server startet neu …"); child.terminate(); child.wait(); break
            else:
                if not auto: return
                print("Server wurde beendet (Fehler im Programm?). Warte auf eine Änderung an den Dateien …")
                while stand() == s0: time.sleep(1)
    except KeyboardInterrupt: pass
    finally:
        if child and child.poll() is None: child.terminate(); child.wait()

if __name__ == "__main__": main()
