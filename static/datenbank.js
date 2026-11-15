const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dt=t=>t?new Date(t*1000).toLocaleDateString('de-DE'):'–';let off=0,gesamt=0,timer;
async function load(reset){if(reset){off=0;$('#pb').innerHTML=''}
 const r=await (await fetch(`/api/dbpage?q=${encodeURIComponent($('#q').value)}&offset=${off}&limit=100`)).json();
 $('#info').textContent=`${r.alle} Produkte in der Datenbank`;gesamt=r.gesamt;
 $('#pb').insertAdjacentHTML('beforeend',r.produkte.map(p=>`<tr><td>${p.image?`<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</td>
  <td><b>${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>`:esc(p.name)}</b><br><small>ID ${esc(p.id)}${p.details_stand?' · Details geladen '+dt(p.details_stand):' · Details noch nicht geladen'}</small></td>
  <td>${esc([p.marke,p.packung].filter(Boolean).join(' · '))||'<span class="mu">–</span>'}</td><td><small>${esc(p.kategorien)||'–'}</small></td>
  <td><small>${p.begriffe.split(', ').filter(Boolean).map(b=>`<a href="#" data-q="${esc(b)}">${esc(b)}</a>`).join(', ')||'–'}</small></td><td class="n">${dt(p.gesehen)}</td></tr>`).join('')||(off?'':'<tr><td colspan="6" class="mu">Keine Produkte gefunden.</td></tr>'));
 off+=r.produkte.length;$('#more').hidden=off>=gesamt;$('#pn').textContent=`${Math.min(off,gesamt)} von ${gesamt} angezeigt`}
async function suchen(){const r=await (await fetch('/api/dbsuchen')).json();const now=Date.now()/1000;
 $('#sn').textContent=`${r.suchen.length} Suchbegriffe. Ein Eintrag gilt ${r.gueltig_tage} Tage, danach wird wieder die API gefragt.`;
 $('#sb').innerHTML=r.suchen.map(s=>`<tr><td><b>${esc(s.begriff)}</b></td><td class="n">${dt(s.stand)}</td><td>${s.treffer}${s.treffer?'':' <small>(damals keine Treffer)</small>'}</td><td class="n ${s.gueltig_bis<now?'old':''}">${dt(s.gueltig_bis)}${s.gueltig_bis<now?' – abgelaufen':''}</td><td>${s.treffer?`<a href="#" data-q="${esc(s.begriff)}">Produkte zeigen</a>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="mu">Noch keine Suchbegriffe.</td></tr>'}
async function standard(){const r=await (await fetch('/api/db')).json();
 $('#db').innerHTML=(r.standard||[]).map(s=>`<tr><td><img src="${esc(s.image)}" alt=""></td><td><b>${esc(s.name)}</b></td><td><small>${esc(s.aliases)}</small></td></tr>`).join('')}
function tab(t){for(const k of['p','s','d','w']){$('#'+k).hidden=k!=t;$('#t-'+k).setAttribute('aria-selected',k==t)}}
$('#t-p').onclick=()=>tab('p');$('#t-s').onclick=()=>{tab('s');suchen()};$('#t-d').onclick=()=>{tab('d');standard()};$('#t-w').onclick=()=>{tab('w');woerter()};
async function woerter(){const r=await (await fetch('/api/woerter')).json();const q=e=>e=='nutzer'?'deine Auswahl':e=='modell'?'Modell':esc(e);
 $('#wn').textContent=`${r.zuordnungen.length} Zuordnungen, ${r.schreibweisen.length} Schreibweisen, ${r.suchbegriffe.length} Suchbegriffe. Eine Auswahl von dir hat immer Vorrang vor der des Modells.`;
 $('#wz').innerHTML=r.zuordnungen.map(z=>`<tr><td>${z.image?`<img src="${esc(z.image)}" alt="" referrerpolicy="no-referrer">`:''}</td><td><b>${esc(z.zutat)}</b></td><td>${z.url?`<a href="${esc(z.url)}" target="_blank" rel="noopener">${esc(z.name)}</a>`:esc(z.name)}</td><td>${q(z.quelle)}</td><td><a href="#" data-v="zuordnung" data-k="${esc(z.zutat)}">vergessen</a></td></tr>`).join('')||'<tr><td colspan="5" class="mu">Noch nichts gelernt.</td></tr>';
 $('#ws').innerHTML=r.schreibweisen.map(z=>`<tr><td>${esc(z.variante)}</td><td><b>${esc(z.hauptform)}</b></td><td>${q(z.quelle)}</td><td><a href="#" data-v="schreibweise" data-k="${esc(z.variante)}">vergessen</a></td></tr>`).join('')||'<tr><td colspan="4" class="mu">Noch nichts gelernt.</td></tr>';
 $('#wb').innerHTML=r.suchbegriffe.map(z=>`<tr><td>${esc(z.zutat)}</td><td><b>${esc(z.begriff)}</b></td><td>${z.treffer}×</td></tr>`).join('')||'<tr><td colspan="3" class="mu">Noch nichts gelernt.</td></tr>'}
document.addEventListener('click',async e=>{const a=e.target.closest('a[data-v]');if(!a)return;e.preventDefault();
 await fetch('/api/vergessen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({art:a.dataset.v,schluessel:a.dataset.k})});woerter()});
$('#q').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>load(true),300)};$('#more').onclick=()=>load(false);
document.body.onclick=e=>{const a=e.target.closest('a[data-q]');if(!a)return;e.preventDefault();$('#q').value=a.dataset.q;tab('p');load(true)};
load(true);
