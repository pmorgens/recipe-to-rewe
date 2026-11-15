// Seite „Gespeicherte Rezepte“: Liste aus rezepte.db, Ansicht des gespeicherten Rezepts, Drucken, Löschen. Adresse /rezepte#3 öffnet Rezept Nr. 3.
const $=s=>document.querySelector(s);let L=[],AKT=0;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const msg=(t,w)=>{$('#msg').textContent=t||'';$('#msg').className=w?'warn':''};
const datum=t=>new Date(t*1000).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
const get=async p=>(await fetch(p,{cache:'no-store'})).json();
const post=async(p,b)=>(await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})).json();
function liste(){const q=$('#q').value.trim().toLowerCase(),f=L.filter(r=>!q||(r.name+' '+r.markt).toLowerCase().includes(q));
 $('#li').innerHTML=f.length?f.map(r=>`<li><button data-id="${r.id}" aria-current="${r.id===AKT}"><b>${esc(r.name)}</b>
  <small>${r.portionen?esc(r.portionen)+' Portionen · ':''}${datum(r.geaendert)}</small>${r.markt?`<small>${esc(r.markt)}</small>`:''}
  <span class="cnt"><span class="tag mu">${r.zutaten} Zutaten</span>${r.ersatz?`<span class="tag wa">${r.ersatz} Ersatz</span>`:''}${r.offen?`<span class="tag wa">${r.offen} offen</span>`:''}</span></button></li>`).join('')
  :`<li class="mu">${L.length?'Kein Rezept passt zum Filter.':'Noch keine Rezepte gespeichert. Auf der Hauptseite unter dem fertigen Rezept „In Rezeptdatenbank speichern“ klicken.'}</li>`}
async function laden(){try{L=await get('/api/rezepte')}catch(e){return msg('Die Rezeptliste konnte nicht geladen werden. Läuft das Programm?',1)}
 liste();const h=+location.hash.slice(1);if(h&&L.some(r=>r.id===h))zeigen(h);else if(!AKT&&L.length&&matchMedia('(min-width:821px)').matches)zeigen(L[0].id)}
async function zeigen(id){const r=await get('/api/rezept?id='+id);if(r.fehler)return msg(r.fehler,1);AKT=id;history.replaceState(null,'','#'+id);liste();
 $('#view').innerHTML=r.html+`<p class="akt noprint"><button onclick="print()">Drucken / als PDF speichern</button><button class="del" id="del">Rezept löschen</button></p>
  <p class="mu noprint"><small>Gespeichert am ${datum(r.erstellt)}${r.geaendert-r.erstellt>60?`, zuletzt geändert am ${datum(r.geaendert)}`:''} · Nr. ${r.id}</small></p>`;
 document.title=r.name+' – Recipe-to-REWE'}
$('#li').onclick=e=>{const b=e.target.closest('button');if(b)msg(''),zeigen(+b.dataset.id).then(()=>{if(!matchMedia('(min-width:821px)').matches)$('#view').scrollIntoView()})};
$('#q').oninput=liste;
$('#view').onclick=async e=>{if(e.target.id!=='del')return;const r=L.find(x=>x.id===AKT);
 if(!confirm(`„${r?r.name:'Rezept'}“ endgültig aus der Rezeptdatenbank löschen? Das lässt sich nicht rückgängig machen.`))return;
 const a=await post('/api/rezept_loeschen',{id:AKT});if(a.fehler)return msg(a.fehler,1);
 msg(`„${r?r.name:'Rezept'}“ wurde gelöscht.`);AKT=0;history.replaceState(null,'',location.pathname);
 $('#view').innerHTML='<p class="mu leer">Wähle ein Rezept aus der Liste.</p>';document.title='Rezepte – Recipe-to-REWE';laden()};
window.onhashchange=()=>{const h=+location.hash.slice(1);if(h&&h!==AKT)zeigen(h)};
laden();
