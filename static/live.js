// Zeigt einen Hinweis, wenn sich das Programm geändert hat (Neustart oder neue Dateien). Die Seite lädt NICHT von selbst neu, damit nichts verloren geht.
(() => {
  let v0 = null;
  const b = document.createElement('div'); b.hidden = true; b.setAttribute('role', 'status'); b.className = 'noprint';
  b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#a35b00;color:#fff;padding:.6rem 1rem;text-align:center;z-index:9';
  b.innerHTML = 'Neue Programmversion verfügbar. <button style="font:inherit;margin-left:.6rem">Seite neu laden</button>';
  b.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(b);
  const tick = async () => {
    try { const v = (await (await fetch('/api/version', {cache: 'no-store'})).json()).v; if (v0 === null) v0 = v; else if (v !== v0) b.hidden = false; } catch (e) {}
    setTimeout(tick, 3000);
  };
  tick();
})();
