// Seite „Nutzung und Dauer“: liest /api/metadaten/seite und zeigt Kennzahlen, Diagramme, Hinweise und die letzten Abfragen.
const $=s=>document.querySelector(s);let D=null,TAGE=30,ART='';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const zahl=(n,st=0)=>n==null?'–':Number(n).toLocaleString('de-DE',{minimumFractionDigits:st,maximumFractionDigits:st});
const pz=(a,b)=>b?Math.round(a/b*100)+' %':'–';
const dauer=ms=>{if(ms==null)return'–';if(ms<1000)return`${Math.round(ms)} ms`;const s=ms/1000;if(s<60)return`${zahl(s,s<10?1:0)} s`;
 const m=Math.floor(s/60);return m<60?`${m} min ${String(Math.round(s%60)).padStart(2,'0')} s`:`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`};
const uhr=t=>new Date(t*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const STUFE={standard:'Standardzutat',grund:'Grundzutat',erinnerung:'Erinnerung',db:'Produktdatenbank',uebersetzung:'Übersetzung + Datenbank',
 api:'API.SH',api_uebersetzung:'API.SH mit Übersetzung',keine:'keine Treffer',fehler:'Fehler'};
const AUFGABE={extrahieren:'Rezept extrahieren',auswahl:'Produkt auswählen',ersatz:'Ersatz vorschlagen',test:'Verbindungstest'};

async function laden(){try{const r=await fetch('/api/metadaten/seite?tage='+TAGE,{cache:'no-store'});D=await r.json()}
 catch(e){return msg('Die Metadaten konnten nicht geladen werden. Läuft das Programm?',1)}
 msg('');$('#stand').textContent='Stand '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const k=D.kennzahlen;
 if(!k.laeufe&&!k.api_anfragen&&!k.ollama_anfragen){$('#inhalt').hidden=true;
  return msg(D.erste?'In diesem Zeitraum gibt es keine Messungen. Wähle einen längeren Zeitraum.':'Noch keine Messungen. Verarbeite auf der Hauptseite ein Rezept, dann erscheinen hier die Auswertungen.')}
 $('#inhalt').hidden=false;kacheln(k);hinweise(k);dauerChart();stufenChart();verlaufChart();tageChart();tabellen();listen();ersatz(k);letzte()}
const msg=(t,w)=>{$('#msg').textContent=t||'';$('#msg').className=w?'warn':''};

function kachel(t,w,u,cls=''){return`<div class="kachel"><div class="t">${t}</div><div class="w ${cls}">${w}</div><div class="u">${u||'&nbsp;'}</div></div>`}
function kacheln(k){const ueber=k.credits_prognose>D.limit;
 $('#k').innerHTML=
  kachel('Rezeptläufe',zahl(k.laeufe),k.laeufe_fehler?`<span class="fehlt">${k.laeufe_fehler} mit Fehler</span>`:(k.zutaten_schnitt?`Ø ${zahl(k.zutaten_schnitt,1)} Zutaten je Rezept`:''))+
  kachel('Dauer je Rezept (Median)',dauer(k.ms_lauf_median),k.ms_lauf_schnitt?`Ø ${dauer(k.ms_lauf_schnitt)} · längster ${dauer(k.ms_lauf_max)}`:'')+
  kachel('Credits im Zeitraum',zahl(k.credits),`Monat: ${zahl(k.credits_monat)} von ${zahl(D.limit)}`)+
  kachel('Prognose Monatsende',zahl(k.credits_prognose)+' Credits',ueber?'<span class="warn">Hinweis: über dem Limit</span>':`bei gleichem Verbrauch · Limit ${zahl(D.limit)}`,ueber?'warn':'')+
  kachel('Zutaten ohne API-Kosten',pz(k.ohne_api,k.zutaten_gesucht),`${zahl(k.ohne_api)} von ${zahl(k.zutaten_gesucht)} Zutaten · ${zahl(k.aus_cache)} API-Antworten aus Zwischenspeicher`)+
  kachel('Modellanfrage (Median)',dauer(k.ollama_ms_median),`${zahl(k.ollama_anfragen)} Anfragen · ${zahl(k.tokens_s,1)} Tokens/s · zusammen ${dauer(k.ollama_ms_summe)}`)+
  kachel('Ersatz gelungen',pz(k.ersatz_ok,k.ersatz),k.ersatz?`${zahl(k.ersatz_ok)} von ${zahl(k.ersatz)} · Median ${dauer(k.ersatz_ms_median)}`:'noch keine Ersatzvorschläge')}

function hinweise(k){const h=[];
 if(k.credits_prognose>D.limit)h.push(`Bei gleichem Verbrauch werden bis Monatsende etwa <b>${zahl(k.credits_prognose)}</b> Credits gebraucht, das Limit liegt bei ${zahl(D.limit)}. Danach pausiert Stufe 2 bis zum Monatswechsel.`);
 D.ollama.filter(o=>o.ms_laden>5000).slice(0,1).forEach(o=>h.push(`Das Modell <b>${esc(o.modell)}</b> braucht im Median ${dauer(o.ms_laden)} nur zum Laden. Ollama entlädt es offenbar zwischen den Anfragen; mit der Umgebungsvariable <code>OLLAMA_KEEP_ALIVE=30m</code> bleibt es länger im Speicher.`));
 const fe=k.ollama_fehler/(k.ollama_anfragen||1);if(k.ollama_anfragen>=5&&fe>=.1)h.push(`${pz(k.ollama_fehler,k.ollama_anfragen)} der Modellanfragen sind fehlgeschlagen. Die Gründe stehen unten bei „Letzte Abfragen“.`);
 const wi=D.ollama.reduce((s,o)=>s+o.wiederholt,0);if(k.ollama_anfragen>=5&&wi/k.ollama_anfragen>=.2)h.push(`Bei ${zahl(wi)} Modellanfragen war ein zweiter Versuch nötig, weil die Antwort unvollständig war. Ein größeres Modell liefert meist zuverlässiger gültiges JSON.`);
 if(D.ollama.some(o=>o.json_einfach))h.push('Ollama kennt hier kein JSON-Schema und das Programm weicht auf einfaches JSON aus. Ein Ollama-Update (ab Version 0.5) macht die Antworten zuverlässiger.');
 if(D.ohne_treffer.length)h.push(`${D.ohne_treffer.length} Zutat(en) blieben ohne Treffer (Liste unten). Ein Eintrag in der Wortdatenbank oder ein gemerkter Ersatz hilft beim nächsten Mal.`);
 if(k.ersatz>=3&&k.ersatz_unsicher/k.ersatz>.3)h.push(`${pz(k.ersatz_unsicher,k.ersatz)} der Ersatzvorschläge waren unsicher. Diese im Rezept besonders prüfen.`);
 $('#hinweise').innerHTML=h.slice(0,4).map(t=>`<div class="h"><b>Hinweis:</b> ${t}</div>`).join('')}

function hbars(el,rows,leer){if(!rows.length)return el.innerHTML=`<p class="leer">${leer}</p>`;const max=Math.max(...rows.map(r=>r.v),1);
 el.innerHTML=`<div class="hb">${rows.map(r=>`<div class="l">${esc(r.l)}</div><div class="spur zeile" data-tip="${esc(r.tip)}"><span class="b" style="width:calc((100% - 7rem) * ${Math.max(.005,r.v/max).toFixed(4)})"></span><span class="v">${r.txt}</span></div>`).join('')}</div>`}
function dauerChart(){const mehr=new Set(D.ollama.map(o=>o.modell)).size>1;
 const rows=D.ollama.filter(o=>o.ms_median).map(o=>({l:(AUFGABE[o.aufgabe]||o.aufgabe||'Anfrage')+(mehr?' · '+o.modell:''),v:o.ms_median,txt:dauer(o.ms_median),
  tip:`${o.modell} · ${AUFGABE[o.aufgabe]||o.aufgabe}\nMedian ${dauer(o.ms_median)}, 90 % unter ${dauer(o.ms_p90)}\nlängste ${dauer(o.ms_max)} · ${o.anfragen} Anfragen`}))
  .concat(D.api.filter(a=>a.ms_median).map(a=>({l:'API.SH '+a.endpunkt,v:a.ms_median,txt:dauer(a.ms_median),tip:`API.SH ${a.endpunkt}\nMedian ${dauer(a.ms_median)}, 90 % unter ${dauer(a.ms_p90)}\n${a.anfragen} Anfragen`})))
  .sort((a,b)=>b.v-a.v);hbars($('#c-dauer'),rows,'Noch keine Messungen.')}
function stufenChart(){const n=D.stufen.reduce((s,x)=>s+x.anzahl,0);
 hbars($('#c-stufen'),D.stufen.map(s=>({l:STUFE[s.stufe]||s.stufe,v:s.anzahl,txt:`${zahl(s.anzahl)} · ${pz(s.anzahl,n)}`,
  tip:`${STUFE[s.stufe]||s.stufe}: ${s.anzahl} von ${n} Zutaten\ntypische Dauer ${dauer(s.ms_median)}`})),'Noch keine Produktsuchen.')}
function verlaufChart(){const el=$('#c-verlauf'),v=D.verlauf||[];
 if(v.length<2){$('#v-text').textContent='Anteil je Rezeptlauf; die Linie glättet über die letzten 5 Läufe.';
  return el.innerHTML=`<p class="leer">${v.length?'Erst ein Rezeptlauf mit Produktsuche im Zeitraum. Ab zwei Läufen erscheint hier der Verlauf.':'Noch keine Rezeptläufe mit Produktsuche im Zeitraum.'}</p>`}
 const W=Math.max(280,el.clientWidth),H=200,L=38,R=12,T=10,B=26,x=i=>L+(v.length===1?0:i*(W-L-R)/(v.length-1)),y=p=>T+(1-p)*(H-T-B);
 const anteil=v.map(r=>r.ohne_api/r.gesucht),glatt=anteil.map((_,i)=>{const s=v.slice(Math.max(0,i-4),i+1);return s.reduce((a,r)=>a+r.ohne_api,0)/s.reduce((a,r)=>a+r.gesucht,0)});
 const tag=t=>new Date(t*1000).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});
 const halb=Math.floor(v.length/2),q=a=>a.reduce((s,r)=>s+r.ohne_api,0)/a.reduce((s,r)=>s+r.gesucht,0),d=Math.round((q(v.slice(halb))-q(v.slice(0,halb)))*100);
 $('#v-text').textContent=`Anteil je Rezeptlauf (${v.length} Läufe); die Linie glättet über die letzten 5 Läufe. `+(v.length>=4?(d>0?`Zweite Hälfte ${d} Prozentpunkte höher als die erste: die Datenbanken lernen.`:d<0?`Zweite Hälfte ${-d} Prozentpunkte niedriger als die erste.`:'Erste und zweite Hälfte gleich auf.'):'');
 el.innerHTML=`<div class="legende"><span><svg width="12" height="12"><circle cx="6" cy="6" r="4" class="pkt" style="fill:var(--ac);fill-opacity:.55"/></svg>je Rezept</span><span><svg width="22" height="12"><line x1="1" y1="6" x2="21" y2="6" style="stroke:var(--ac);stroke-width:2"/></svg>Durchschnitt der letzten 5 Läufe</span></div>
 <svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Anteil der Zutaten ohne API-Kosten je Rezeptlauf, zuletzt ${Math.round(glatt.at(-1)*100)} Prozent im Durchschnitt der letzten 5 Läufe">
 ${[0,.5,1].map(p=>`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(p)}" y2="${y(p)}"/><text class="ax" x="${L-6}" y="${y(p)+4}" text-anchor="end">${p*100} %</text>`).join('')}
 <text class="ax" x="${L}" y="${H-6}">${tag(v[0].zeit)}</text><text class="ax" x="${W-R}" y="${H-6}" text-anchor="end">${tag(v.at(-1).zeit)}</text>
 <polyline class="linie" points="${glatt.map((g,i)=>`${x(i).toFixed(1)},${y(g).toFixed(1)}`).join(' ')}"/>
 ${v.map((r,i)=>`<g data-tip="${new Date(r.zeit*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
${r.ohne_api} von ${r.gesucht} Zutaten ohne API-Kosten (${Math.round(anteil[i]*100)} %)
Durchschnitt letzte 5: ${Math.round(glatt[i]*100)} %"><circle class="hit" cx="${x(i)}" cy="${y(anteil[i])}" r="9"/><circle class="pkt" cx="${x(i)}" cy="${y(anteil[i])}" r="4"/></g>`).join('')}
 <text class="ax" x="${x(v.length-1)-6}" y="${y(glatt.at(-1))-9}" text-anchor="end" style="fill:var(--fg)">${Math.round(glatt.at(-1)*100)} %</text></svg>`}
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(D)verlaufChart()},150)});
function tageChart(){const heute=new Date();heute.setHours(12,0,0,0);const n=Math.min(TAGE||31,31),m={};D.pro_tag.forEach(t=>m[t.tag]=t);
 const tage=[...Array(n)].map((_,i)=>{const d=new Date(heute);d.setDate(d.getDate()-(n-1-i));const key=d.toLocaleDateString('sv-SE');return{key,d,...(m[key]||{credits:0,laeufe:0})}});
 const max=Math.max(...tage.map(t=>t.credits),1);
 $('#c-tage').innerHTML=`<div class="saeulen"><span class="gitter" style="top:1.2rem">${zahl(max)}</span>${tage.map(t=>`<div class="s" data-tip="${t.d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})}\n${t.credits} Credits · ${t.laeufe} Rezeptläufe"><i style="height:${t.credits/max*100}%"></i></div>`).join('')}</div>
  <div class="achse"><span>${tage[0].d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span><span>heute</span></div>`}

function tabellen(){
 $('#t-ollama').innerHTML=D.ollama.length?`<thead><tr><th>Modell</th><th>Aufgabe</th><th class="z">Anfragen</th><th class="z">Median</th><th class="z">90 % unter</th><th class="z">Längste</th><th class="z">Laden</th><th class="z">Tokens ein → aus</th><th class="z">Tokens/s</th><th class="z">2. Versuch</th><th class="z">Fehler</th></tr></thead><tbody>${
  D.ollama.map(o=>`<tr><td>${esc(o.modell)}</td><td>${esc(AUFGABE[o.aufgabe]||o.aufgabe)}</td><td class="z">${zahl(o.anfragen)}</td><td class="z">${dauer(o.ms_median)}</td><td class="z">${dauer(o.ms_p90)}</td><td class="z">${dauer(o.ms_max)}</td><td class="z">${dauer(o.ms_laden)}</td><td class="z">Ø ${zahl(o.tokens_ein)} → ${zahl(o.tokens_aus)}</td><td class="z">${zahl(o.tokens_s,1)}</td><td class="z">${zahl(o.wiederholt)}</td><td class="z ${o.fehler?'fehlt':''}">${zahl(o.fehler)}</td></tr>`).join('')}</tbody>`:'<tr><td class="leer">Keine Modellanfragen im Zeitraum.</td></tr>';
 $('#t-api').innerHTML=D.api.length?`<thead><tr><th>Endpunkt</th><th class="z">Anfragen</th><th class="z">Credits</th><th class="z">Aus Zwischenspeicher</th><th class="z">Median</th><th class="z">90 % unter</th><th class="z">Ø Treffer</th><th class="z">Fehler</th></tr></thead><tbody>${
  D.api.map(a=>`<tr><td>${esc(a.endpunkt)}</td><td class="z">${zahl(a.anfragen)}</td><td class="z">${zahl(a.credits)}</td><td class="z">${zahl(a.aus_cache)} (${pz(a.aus_cache,a.anfragen)})</td><td class="z">${dauer(a.ms_median)}</td><td class="z">${dauer(a.ms_p90)}</td><td class="z">${zahl(a.treffer_schnitt,1)}</td><td class="z ${a.fehler?'fehlt':''}">${zahl(a.fehler)}</td></tr>`).join('')}</tbody>`:'<tr><td class="leer">Keine API.SH-Anfragen im Zeitraum.</td></tr>'}
function listen(){
 $('#l-ohne').innerHTML=D.ohne_treffer.length?D.ohne_treffer.map(([z,n])=>`<li>${esc(z)} <span class="z">${n}×</span></li>`).join(''):'<li class="leer">Alle gesuchten Zutaten wurden gefunden.</li>';
 $('#l-langsam').innerHTML=D.langsamste.length?D.langsamste.map(x=>`<li>${esc(x.zutat)} <span class="z">${dauer(x.ms)} · ${esc(STUFE[x.stufe]||x.stufe)}</span></li>`).join(''):'<li class="leer">Noch keine Produktsuchen.</li>'}
function ersatz(k){$('#ersatz').innerHTML=k.ersatz?`<p>${zahl(k.ersatz)} Vorschläge: <b>${zahl(k.ersatz_ok)} gelungen</b> (${pz(k.ersatz_ok,k.ersatz)}), ${zahl(k.ersatz_unsicher)} davon unsicher, ${zahl(k.ersatz_mischung)} als Gewürzmischung. Typische Dauer ${dauer(k.ersatz_ms_median)}.</p>`+
 (D.gruende.length?`<p class="mu klein">Häufigste Gründe, wenn ein Vorschlag nicht passte:</p><ol class="liste">${D.gruende.map(([g,n])=>`<li>${esc(g)} <span class="z">${n}×</span></li>`).join('')}</ol>`:''):'<p class="leer">Noch keine Ersatzvorschläge im Zeitraum.</p>'}
function letzte(){const r=D.letzte.filter(x=>!ART||x.art===ART);
 $('#t-letzte').innerHTML=r.length?`<thead><tr><th>Zeit</th><th>Art</th><th>Was</th><th class="z">Dauer</th><th>Ergebnis</th></tr></thead><tbody>${
  r.map(x=>`<tr><td class="z">${uhr(x.zeit)}</td><td>${x.art}</td><td>${esc(x.was)}</td><td class="z">${dauer(x.ms)}</td><td class="${x.fehler?'fehlt':''}">${x.fehler?'Fehler: ':''}${esc(x.info)}</td></tr>`).join('')}</tbody>`:'<tr><td class="leer">Keine Einträge.</td></tr>'}

document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{TAGE=+b.dataset.t;document.querySelectorAll('[data-t]').forEach(x=>x.setAttribute('aria-pressed',x===b));laden()});
document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{ART=b.dataset.a;document.querySelectorAll('[data-a]').forEach(x=>x.setAttribute('aria-pressed',x===b));if(D)letzte()});
$('#neu').onclick=laden;
document.addEventListener('mousemove',e=>{const t=e.target.closest&&e.target.closest('[data-tip]'),tip=$('#tip');if(!t)return tip.hidden=true;
 tip.textContent=t.dataset.tip;tip.hidden=false;const w=tip.offsetWidth,h=tip.offsetHeight;
 tip.style.left=Math.min(innerWidth-w-8,e.clientX+12)+'px';tip.style.top=(e.clientY-h-12<0?e.clientY+16:e.clientY-h-12)+'px'});
setInterval(()=>{if(document.visibilityState==='visible')laden()},30000);
laden();
