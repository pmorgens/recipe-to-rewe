const $=s=>document.querySelector(s),E=new Map();let V=0,base=0,DG={};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ico={ok:'✔',error:'✖',run:'<span class="spin">◔</span>',warn:'!'},KIND={api:'API.SH',db:'Datenbank',model:'Modell',programm:'Programm',fetch:'HelloFresh'};
async function diag(){const d=DG=await (await fetch('/api/diag')).json();
 const row=(s,t,h)=>`<li class="chk"><span class="dot ${s}">${ico[s]}</span><span>${t}${h?`<br><small>${h}</small>`:''}</span></li>`;
 $('#chk').innerHTML=[
  d.key?row('ok','API-Schlüssel gefunden',`Quelle: ${esc(d.key_quelle)}, Länge ${d.key_laenge} Zeichen`):
   row('error','Kein API-Schlüssel gefunden',`Im Ordner <code>${esc(d.ordner)}</code> eine Datei <code>.env</code> mit der Zeile <code>APISH_KEY=dein-schluessel</code> anlegen (<code>.env.txt</code> wird ebenfalls gelesen). Gefundene Dateien: ${d.env_dateien.length?esc(d.env_dateien.join(', ')):'keine'}. Ein Neustart ist nicht nötig.`),
  d.stufe2?row(d.key?'ok':'warn','Stufe 2 (API-Suche) ist eingeschaltet',d.key?'':'Ohne Schlüssel wird die API nicht aufgerufen.'):row('warn','Stufe 2 ist ausgeschaltet','Haken „Produkte im REWE-Online-Sortiment suchen“ im Programm setzen, sonst wird die Produktsuche nie aufgerufen.'),
  d.markt_id?row('ok','Markt gewählt',esc(d.markt)):row('warn','Kein Markt über die Marktsuche gewählt',d.markt?`Freitext: ${esc(d.markt)}`:'Im Programm Postleitzahl suchen und Markt anklicken.'),
  d.ollama?row(d.ollama_alt?'warn':'ok',`Ollama erreichbar${d.ollama_version?' (Version '+esc(d.ollama_version)+')':''}`,`Modelle: ${esc(d.modelle.join(', ')||'keine')}${d.ollama_alt?'. Diese Ollama-Version ist älter als 0.5; das Programm weicht dann auf einfaches JSON aus, ein Update von Ollama ist besser.':''}`):row('error','Ollama nicht erreichbar','Ollama starten und diese Seite neu laden.'),
  d.modell_ok?row('ok','Modell gewählt',esc(d.modell)):row('warn','Gewähltes Modell nicht installiert',`Eingestellt: ${esc(d.modell||'keins')}. Im Programm ein installiertes Modell wählen.`),
  row('ok',`Produktdatenbank: ${d.db_produkte} Produkte, ${d.db_suchen} Suchbegriffe, ${d.db_details} mit Details, ${d.db_standard} Standardzutaten`,`Einträge gelten ${d.gueltig_tage} Tage, danach wird wieder die API gefragt · <a href="/datenbank">alles ansehen</a>`),
  row('ok',`Wortdatenbank: ${d.w_zuordnungen} Zuordnungen, ${d.w_schreibweisen} Schreibweisen, ${d.w_suchbegriffe} Suchbegriffe`,'Bekannte Zutaten werden ohne Modell und ohne API übernommen · <a href="/datenbank">ansehen</a>'),
  row('ok',`API-Credits diesen Monat: ${d.credits} von ${d.limit}`,`Python ${esc(d.python)} · Schnittstelle ${esc(d.api_url)}`)].join('');summary()}
function draw(){let L=[...E.values()].sort((a,b)=>b.id-a.id);const all=L.length;if($('#onlyapi').checked)L=L.filter(e=>e.kind=='api');
 $('#n').textContent=`(${L.length} von ${all} Schritten)`;
 $('#log').innerHTML=L.map(e=>`<tr class="${e.state}"><td class="t">${e.t}</td><td>${e.kind?`<span class="k k-${e.kind}">${KIND[e.kind]||''}</span>`:''}</td><td><b>${esc(e.step)}</b><div class="d ${e.kind||''}">${esc(e.detail).replace(/\n/g,'<br>')}</div></td>
  <td class="dot ${e.state}">${ico[e.state]||''}</td><td class="cr">${e.kind=='api'&&e.state=='ok'?esc(e.credits)+' Cr.':''}</td><td class="ms">${e.ms==null?'läuft …':e.ms+' ms'}</td></tr>`).join('')||'<tr><td class="mu">Noch nichts passiert. Im Programm ein Rezept verarbeiten oder oben einen Test starten.</td></tr>'}
function stats(){const L=[...E.values()].filter(e=>e.id>base),fin=e=>e.state!='run';
 const api=L.filter(e=>e.kind=='api'&&fin(e)),sent=api.filter(e=>e.state=='ok'&&e.cache!='lokal'),loc=api.filter(e=>e.state=='ok'&&e.cache=='lokal'),err=api.filter(e=>e.state=='error');
 const uniq=(a,k)=>[...new Set(a.map(e=>e.params&&e.params[k]).filter(Boolean))],ep=p=>sent.filter(e=>e.endpoint==p);
 const db=L.filter(e=>e.kind=='db'),art=a=>db.filter(e=>e.art==a),mod=L.filter(e=>e.kind=='model'&&fin(e));
 return{sent,loc,err,api,ep,uniq,credits:sent.reduce((a,e)=>a+(e.credits||0),0),apiCache:sent.filter(e=>e.cache=='api').length,
  treffer:art('treffer'),miss:art('miss'),std:art('standard'),erin:art('erinnerung'),alt:art('alternativ'),saved:art('gespeichert'),neu:art('gespeichert').reduce((a,e)=>a+(e.neu||0),0),detDb:art('details').length,
  mod,modErr:mod.filter(e=>e.state=='error').length,modMs:mod.reduce((a,e)=>a+(e.ms||0),0),fetch:L.filter(e=>e.kind=='fetch'&&fin(e)),n:L.length}}
const li=a=>a.length?`<ul>${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';
function summary(){const s=stats();$('#sn').textContent=`(${s.n} Schritte seit dem letzten Zurücksetzen)`;
 const looked=s.treffer.length+s.miss.length+s.std.length+s.erin.length;
 const fazit=!s.n?'Noch keine Daten. Verarbeite ein Rezept im Programm.':
  `Für ${looked} Zutaten wurde nachgeschlagen: ${s.std.length} als Standardzutat erkannt, ${s.erin.length} aus der Wortdatenbank (Erinnerung), ${s.treffer.length} aus der Produktdatenbank beantwortet, ${s.miss.length} nicht in der Datenbank gefunden. `+
  `An API.SH gingen ${s.sent.length} Anfragen mit zusammen ${s.credits} Credit${s.credits==1?'':'s'}${s.err.length?`, ${s.err.length} davon schlugen fehl`:''}. ${s.neu} neue Produkte wurden in der Datenbank gespeichert.`;
 const q=s.uniq(s.ep('/search'),'q'),mk=s.uniq(s.ep('/markets'),'q'),ids=s.uniq(s.ep('/product'),'id');
 $('#sum').innerHTML=`<div class="fazit"><b>Fazit:</b> ${esc(fazit)}</div><div class="cards">
 <div class="card"><h3>An API.SH gesendet</h3><div class="big">${s.sent.length} Anfragen · ${s.credits} Credits</div>
  <ul><li>Produktsuche: ${s.ep('/search').length}× ${q.length?'– '+esc(q.map(x=>`„${x}“`).join(', ')):''}</li><li>Marktsuche: ${s.ep('/markets').length}× ${mk.length?'– '+esc(mk.join(', ')):''}</li>
  <li>Produktdetails: ${s.ep('/product').length}× ${ids.length?'– IDs '+esc(ids.join(', ')):''}</li>${s.apiCache?`<li>davon ${s.apiCache} von API.SH aus deren Zwischenspeicher beantwortet (0 Credits)</li>`:''}
  ${s.err.length?`<li class="error">${s.err.length} Fehler: ${esc(s.err.map(e=>e.detail.split('\n').pop().replace(/^Fehler: /,'')).slice(0,3).join(' | '))}</li>`:''}</ul></div>
 <div class="card"><h3>Nicht an API.SH gesendet</h3><div class="big">${s.loc.length+s.treffer.length+s.std.length+s.detDb} Abfragen gespart</div>
  <ul><li>Aus der Datenbank beantwortet: ${s.treffer.length}× ${s.treffer.length?'– '+esc([...new Set(s.treffer.map(e=>e.begriff))].join(', ')):''}</li>
  <li>Standardzutaten erkannt: ${s.std.length}× ${s.std.length?'– '+esc([...new Set(s.std.map(e=>e.begriff))].join(', ')):''}</li><li>Details aus der Datenbank: ${s.detDb}×</li><li>Aus dem lokalen Zwischenspeicher (z. B. Märkte): ${s.loc.length}×</li></ul></div>
 <div class="card"><h3>Datenbank</h3><div class="big">+${s.neu} neue Produkte</div>
  <ul><li>${s.saved.length} Suchbegriffe neu gespeichert, ${s.miss.length} Mal war die Datenbank nicht ausreichend</li><li>Stand jetzt: ${DG.db_produkte??'?'} Produkte, ${DG.db_suchen??'?'} Suchbegriffe, ${DG.db_details??'?'} mit Details</li></ul></div>
 <div class="card"><h3>Lokales Modell</h3><div class="big">${s.mod.length} Anfragen</div>
  <ul><li>Gesamtdauer: ${(s.modMs/1000).toFixed(1)} s${s.mod.length?`, im Schnitt ${(s.modMs/s.mod.length/1000).toFixed(1)} s`:''}</li><li>Fehlgeschlagen: ${s.modErr}</li><li>HelloFresh-Abrufe: ${s.fetch.length}</li></ul></div></div>
 <p class="mu">Credits laut Antwort von API.SH. Der Monatsstand steht in der Prüfliste oben.</p>`}
function sumText(){const s=stats();return `Zusammenfassung: ${s.sent.length} API.SH-Anfragen, ${s.credits} Credits, ${s.err.length} Fehler; Datenbank beantwortet ${s.treffer.length}, Standardzutaten ${s.std.length}, aus Erinnerung ${s.erin.length}, nicht in DB ${s.miss.length}; ${s.neu} neue Produkte gespeichert; Modell ${s.mod.length} Anfragen (${(s.modMs/1000).toFixed(1)} s, ${s.modErr} Fehler)`}
async function poll(){try{const r=await (await fetch('/api/log?since='+V)).json();if(r.v<V){E.clear();V=0;base=0}
 if(r.events.length){r.events.forEach(e=>E.set(e.id,e));V=r.v;draw();summary();if(r.events.some(e=>/Datenbank|API|Produkt/.test(e.step)))diag()}}catch(e){$('#tr').textContent='Server nicht erreichbar'}setTimeout(poll,1000)}
async function test(was,b){b.disabled=true;$('#tr').textContent='Test läuft …';
 const r=await (await fetch('/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({was})})).json();
 b.disabled=false;$('#tr').textContent=r.fehler?'Fehler: '+r.fehler:'OK: '+r.detail}
$('#tm').onclick=e=>test('ollama',e.target);$('#ta').onclick=e=>test('api',e.target);$('#onlyapi').onchange=draw;
$('#reset').onclick=()=>{base=Math.max(0,...E.keys());summary()};
$('#cp').onclick=()=>{navigator.clipboard.writeText([...E.values()].map(e=>`${e.t} [${e.state}] ${e.step}: ${String(e.detail).replace(/\n/g,' | ')} ${e.ms==null?'':e.ms+'ms'}`).join('\n')+'\n\n'+sumText());$('#tr').textContent='Kopiert'};
diag();poll();
