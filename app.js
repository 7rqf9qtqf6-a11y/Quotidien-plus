'use strict';

const KEY = 'cockpitGabriel.v3';
const emptyDb = () => ({
  profile: { name: 'Gabriel', energy: '' },
  tasks: [], goals: [], admin: [], finance: [], jobs: [], gco: [], ideas: [], checkins: []
});

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const iso = () => new Date().toISOString().slice(0, 10);
const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt = (d) => d ? new Intl.DateTimeFormat('fr-CH', {day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${d}T12:00:00`)) : 'Sans date';
const days = (d) => !d ? null : Math.round((new Date(`${d}T12:00:00`) - new Date(`${iso()}T12:00:00`)) / 86400000);
const money = (n) => new Intl.NumberFormat('fr-CH', { style:'currency', currency:'CHF' }).format(Number(n) || 0);

function loadDb() {
  for (const reader of [
    () => localStorage.getItem(KEY),
    () => sessionStorage.getItem(KEY)
  ]) {
    try {
      const raw = reader();
      if (raw) return { ...emptyDb(), ...JSON.parse(raw) };
    } catch (_) {}
  }
  return emptyDb();
}

let db = loadDb();
let filter = 'open';
let activeModule = 'admin';
let editing = null;

function persist() {
  const raw = JSON.stringify(db);
  try {
    localStorage.setItem(KEY, raw);
    return true;
  } catch (_) {
    try { sessionStorage.setItem(KEY, raw); } catch (_) {}
    return false;
  }
}

function save(message = '') {
  const stored = persist();
  render();
  if (message) toast(stored ? message : `${message} — stockage Safari indisponible`);
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

const rules = {
  Rouge: { max: 1, title: 'Préserver l’essentiel', advice: 'Une seule tâche indispensable. Pas de décision lourde.' },
  Orange: { max: 2, title: 'Maintenir sans forcer', advice: 'Deux priorités maximum et un bloc concentré.' },
  Vert: { max: 3, title: 'Avancer sans s’épuiser', advice: 'Trois priorités maximum. Arrête avant la chute d’énergie.' }
};

const statusClass = (s) => {
  if (['Terminé','Acceptée','Oui','Classé'].includes(s)) return 'green';
  if (['Critique','Refusée','Abandonné','Annulé'].includes(s)) return 'red';
  if (['Haute','En attente','En attente de réponse','Relance','En pause','Non'].includes(s)) return 'orange';
  if (['Actif','Envoyée','En cours','Planifié'].includes(s)) return 'blue';
  return '';
};
const dateClass = (n) => n === null ? '' : n < 0 ? 'red' : n <= 7 ? 'orange' : 'blue';
const badge = (text, cls = '') => `<span class="badge ${cls}">${esc(text)}</span>`;
const emptyCard = (title, text) => `<div class="empty"><b>${esc(title)}</b><p class="muted">${esc(text)}</p></div>`;
const isOpenTask = (x) => !['Terminé','Annulé'].includes(x.status);

function keyFor(type) {
  return ({ task:'tasks', goal:'goals', checkin:'checkins', idea:'ideas' })[type] || type;
}

function actions(type, id, canComplete = false, completed = false) {
  return `<div class="actions">
    ${canComplete ? `<button class="done" data-${completed ? 'reopen' : 'done'}="${esc(id)}">${completed ? 'Rouvrir' : 'Terminer'}</button>` : ''}
    <button data-edit="${esc(type)}" data-id="${esc(id)}">Modifier</button>
    <button data-delete="${esc(type)}" data-id="${esc(id)}">Supprimer</button>
  </div>`;
}

function renderHeader() {
  const now = new Date();
  $('#today').textContent = new Intl.DateTimeFormat('fr-CH', { weekday:'long', day:'numeric', month:'long' }).format(now);
  const h = now.getHours();
  $('#hello').textContent = `${h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'} ${db.profile.name}`;
  const r = rules[db.profile.energy];
  $('#energyTitle').textContent = r?.title || 'Choisis ton niveau';
  $('#energyAdvice').textContent = r?.advice || 'Le nombre de priorités sera adapté automatiquement.';
  $('#limit').textContent = r ? `${r.max} priorité${r.max > 1 ? 's' : ''} recommandée${r.max > 1 ? 's' : ''}.` : 'Choisis d’abord ton énergie.';
  $$('[data-energy]').forEach((b) => b.classList.toggle('selected', b.dataset.energy === db.profile.energy));
}

function renderHome() {
  const openTasks = db.tasks.filter(isOpenTask);
  const late = openTasks.filter((x) => days(x.due) !== null && days(x.due) < 0);
  const soon = openTasks.filter((x) => days(x.due) !== null && days(x.due) >= 0 && days(x.due) <= 7);
  const unpaid = db.finance.filter((x) => x.type === 'Dépense' && x.paid !== 'Oui');
  $('#kpis').innerHTML = [
    ['Tâches ouvertes', openTasks.length, 'À traiter'],
    ['Retards', late.length, late.length ? 'À prioriser' : 'Aucun'],
    ['Échéances ≤ 7 j', soon.length, 'À surveiller'],
    ['À payer', money(unpaid.reduce((s, x) => s + Number(x.amount || 0), 0)), `${unpaid.length} élément${unpaid.length > 1 ? 's' : ''}`]
  ].map(([a,b,c]) => `<div class="kpi"><small>${esc(a)}</small><b>${esc(b)}</b><span class="muted">${esc(c)}</span></div>`).join('');
  $('#homeGoals').innerHTML = db.goals.length ? db.goals.slice(0,3).map(goalCard).join('') : emptyCard('Aucun résultat défini', 'Choisis jusqu’à trois résultats concrets pour cette semaine.');
  const alerts = [
    ...late.map((x) => ({ title:x.title, text:`En retard depuis ${Math.abs(days(x.due))} jour(s)`, cls:'red' })),
    ...soon.map((x) => ({ title:x.title, text:`Échéance ${fmt(x.due)}`, cls:'orange' }))
  ].slice(0,5);
  $('#alerts').innerHTML = alerts.length ? alerts.map((x) => `<article class="item"><div class="item-top"><h3>${esc(x.title)}</h3>${badge(x.text,x.cls)}</div></article>`).join('') : emptyCard('Aucune alerte urgente', 'Le cockpit ne remonte que ce qui mérite ton attention.');
}

function taskCard(x) {
  const done = x.status === 'Terminé';
  return `<article class="item"><div class="item-top"><div><h3>${esc(x.title)}</h3><p class="muted">${esc(x.notes || x.domain || '')}</p></div>${badge(x.status || 'À faire', statusClass(x.status))}</div>
    <div class="badges">${x.priority ? badge(x.priority,statusClass(x.priority)) : ''}${x.due ? badge(fmt(x.due),dateClass(days(x.due))) : ''}${x.energy ? badge(`Énergie ${x.energy}`) : ''}${x.duration ? badge(`${x.duration} min`) : ''}</div>
    ${actions('task',x.id,true,done)}</article>`;
}

function goalCard(x) {
  const p = Math.min(100, Math.max(0, Number(x.progress) || 0));
  return `<article class="item"><div class="item-top"><div><h3>${esc(x.title)}</h3><p class="muted">${esc(x.nextAction || 'Prochaine action à définir')}</p></div>${badge(x.status || 'Planifié',statusClass(x.status))}</div>
    <div class="progress"><span style="width:${p}%"></span></div><div class="badges">${badge(`${p}%`,'purple')}${x.due ? badge(fmt(x.due),dateClass(days(x.due))) : ''}</div>${actions('goal',x.id)}</article>`;
}

function renderTasks() {
  let list = [...db.tasks].sort((a,b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
  if (filter === 'open') list = list.filter(isOpenTask);
  if (filter === 'done') list = list.filter((x) => x.status === 'Terminé');
  $('#tasks').innerHTML = list.length ? list.map(taskCard).join('') : emptyCard('Aucune tâche ici', 'Ajoute uniquement ce qui mérite ton énergie.');
}

function renderGoals() {
  $('#goals').innerHTML = db.goals.length ? db.goals.map(goalCard).join('') : emptyCard('Aucun résultat cette semaine', 'Choisis un résultat observable, pas une intention vague.');
}

const moduleLabels = { admin:'Administration', finance:'Finances', jobs:'Emploi', gco:'GCO', ideas:'Attente' };
function moduleSummary(list) {
  const total = list.length;
  const active = list.filter((x) => !['Terminé','Classé','Refusée','Abandonné','Annulé'].includes(x.status || x.decision)).length;
  const urgent = list.filter((x) => days(x.due || x.followup || x.reviewDate || x.date) !== null && days(x.due || x.followup || x.reviewDate || x.date) <= 7).length;
  return [[total,'Total'],[active,'Actifs'],[urgent,'≤ 7 jours']];
}

function renderModule() {
  const list = db[activeModule] || [];
  $('#moduleTitle').textContent = moduleLabels[activeModule];
  $$('[data-module]').forEach((b) => b.classList.toggle('active', b.dataset.module === activeModule));
  $('#moduleSummary').innerHTML = moduleSummary(list).map(([n,l]) => `<div class="sum"><b>${n}</b><small>${l}</small></div>`).join('');
  let html = '';
  if (activeModule === 'admin') html = list.map((x) => `<article class="item"><div class="item-top"><div><h3>${esc(x.subject)}</h3><p class="muted">${esc(x.org || x.nextAction || '')}</p></div>${badge(x.status || 'À faire',statusClass(x.status))}</div><div class="badges">${x.priority ? badge(x.priority,statusClass(x.priority)) : ''}${x.due ? badge(fmt(x.due),dateClass(days(x.due))) : ''}</div>${actions('admin',x.id)}</article>`).join('');
  if (activeModule === 'finance') html = list.map((x) => `<article class="item"><div class="item-top"><div><h3>${esc(x.label)}</h3><p class="muted">${esc(x.category || '')}</p></div>${badge(money(x.amount),x.type === 'Revenu' ? 'green' : 'orange')}</div><div class="badges">${badge(x.type || 'Mouvement')}${badge(x.paid || 'Non',statusClass(x.paid))}${x.date ? badge(fmt(x.date),dateClass(days(x.date))) : ''}</div>${actions('finance',x.id)}</article>`).join('');
  if (activeModule === 'jobs') html = list.map((x) => `<article class="item"><div class="item-top"><div><h3>${esc(x.position)}</h3><p class="muted">${esc(x.company || '')}</p></div>${badge(x.status || 'À étudier',statusClass(x.status))}</div><div class="badges">${x.rate ? badge(`${x.rate}%`) : ''}${x.remote ? badge(`Télétravail ${x.remote}`,'blue') : ''}${x.followup ? badge(`Relance ${fmt(x.followup)}`,dateClass(days(x.followup))) : ''}</div>${actions('jobs',x.id)}</article>`).join('');
  if (activeModule === 'gco') html = list.map((x) => { const p=Math.min(100,Math.max(0,Number(x.progress)||0)); return `<article class="item"><div class="item-top"><div><h3>${esc(x.project)}</h3><p class="muted">${esc(x.nextAction || x.definition || '')}</p></div>${badge(x.status || 'Planifié',statusClass(x.status))}</div><div class="progress"><span style="width:${p}%"></span></div><div class="badges">${badge(`${p}%`,'purple')}${x.type ? badge(x.type) : ''}${x.due ? badge(fmt(x.due),dateClass(days(x.due))) : ''}</div>${actions('gco',x.id)}</article>`; }).join('');
  if (activeModule === 'ideas') html = list.map((x) => { const score=(Number(x.impact)||0)*2+(Number(x.urgency)||0)*2-(Number(x.effort)||0); return `<article class="item"><div class="item-top"><div><h3>${esc(x.idea)}</h3><p class="muted">${esc(x.category || '')}</p></div>${badge(`Score ${score}`,'purple')}</div><div class="badges">${badge(`Impact ${x.impact || 0}/5`)}${badge(`Effort ${x.effort || 0}/5`)}${badge(x.decision || 'À revoir',statusClass(x.decision))}</div>${actions('idea',x.id)}</article>`; }).join('');
  $('#moduleList').innerHTML = html || emptyCard('Aucun élément', 'Ajoute seulement ce qui mérite un suivi.');
}

function renderCheckins() {
  const list = [...db.checkins].sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const avg = (field) => list.length ? (list.reduce((s,x) => s + Number(x[field] || 0), 0) / list.length).toFixed(1) : '0';
  const mins = list.reduce((s,x) => s + Number(x.minutes || 0), 0);
  $('#reviewKpis').innerHTML = [['Fatigue',`${avg('fatigue')}/10`],['Concentration',`${avg('focus')}/10`],['Temps utile',`${mins} min`],['Bilans',list.length]].map(([a,b]) => `<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join('');
  $('#checkins').innerHTML = list.length ? list.map((x) => `<article class="item"><div class="item-top"><div><h3>${fmt(x.date)}</h3><p class="muted">${esc(x.result || 'Aucun résultat noté')}</p></div>${badge(x.energy || 'Non défini',x.energy === 'Rouge' ? 'red' : x.energy === 'Orange' ? 'orange' : 'green')}</div><div class="badges">${badge(`Fatigue ${x.fatigue || 0}/10`,'orange')}${badge(`Concentration ${x.focus || 0}/10`,'blue')}${badge(`${x.minutes || 0} min`)}</div>${actions('checkin',x.id)}</article>`).join('') : emptyCard('Aucun bilan', 'Deux minutes suffisent pour comprendre ton rythme.');
}

function render() {
  renderHeader(); renderHome(); renderTasks(); renderGoals(); renderModule(); renderCheckins();
}

const templates = {
  task: [['title','Tâche / résultat','text',true],['domain','Domaine','select',false,['Santé / administration','Finances','Emploi','GCO','Maison','Personnel','Loisirs']],['due','Échéance','date'],['priority','Priorité','select',false,['Critique','Haute','Normale','Basse']],['status','Statut','select',false,['À faire','En cours','En attente','Terminé','Annulé']],['energy','Énergie requise','select',false,['Rouge','Orange','Vert']],['duration','Durée estimée en minutes','number'],['notes','Notes','textarea']],
  goal: [['title','Résultat attendu','text',true],['domain','Domaine','select',false,['Santé / administration','Finances','Emploi','GCO','Maison','Personnel']],['status','Statut','select',false,['Planifié','Actif','En pause','Terminé','Abandonné']],['progress','Progression en %','number'],['nextAction','Prochaine action','text'],['due','Échéance','date']],
  admin: [['org','Organisme','text'],['subject','Sujet / dossier','text',true],['nextAction','Prochaine action','text'],['due','Échéance','date'],['priority','Priorité','select',false,['Critique','Haute','Normale','Basse']],['status','Statut','select',false,['À faire','En cours','En attente de réponse','Terminé','Classé']],['notes','Notes / référence','textarea']],
  finance: [['date','Date / échéance','date',true],['type','Type','select',true,['Revenu','Dépense']],['category','Catégorie','text'],['label','Libellé','text',true],['amount','Montant CHF','number',true],['paid','Payé ?','select',false,['Oui','Non']],['notes','Commentaire','textarea']],
  jobs: [['company','Entreprise','text'],['position','Poste','text',true],['rate','Taux en %','number'],['remote','Télétravail','select',false,['Oui','Partiel','Non','À vérifier']],['health','Compatibilité santé /5','number'],['status','Statut','select',false,['À étudier','À préparer','Envoyée','Relance','Entretien','Refusée','Acceptée']],['followup','Relance prévue','date'],['notes','Lien / contact / notes','textarea']],
  gco: [['project','Projet','text',true],['type','Type','select',false,['Guide','Tableau Excel','Document','Visuel','LinkedIn','Portfolio','Autre']],['definition','Résultat considéré comme terminé','textarea'],['status','Statut','select',false,['Idée','Planifié','Actif','En pause','Terminé','Abandonné']],['progress','Progression en %','number'],['due','Livraison prévue','date'],['nextAction','Prochaine action','text']],
  idea: [['idea','Idée / projet','text',true],['category','Catégorie','text'],['impact','Impact /5','number'],['effort','Effort /5','number'],['urgency','Urgence /5','number'],['reviewDate','Revoir le','date'],['decision','Décision','select',false,['Conserver','Planifier','Abandonner','Déléguer','À revoir']],['notes','Notes','textarea']],
  checkin: [['date','Date','date',true],['energy','Énergie','select',true,['Rouge','Orange','Vert']],['sleep','Sommeil /10','number'],['fatigue','Fatigue /10','number'],['focus','Concentration /10','number'],['minutes','Temps utile en minutes','number'],['result','Résultat principal','textarea'],['cost','Ce qui a coûté de l’énergie','textarea'],['simplify','Ce que je simplifie','textarea'],['decision','Décision pour demain','textarea']]
};

function fieldHtml([name,label,type,required,options=[]]) {
  const req = required ? 'required' : '';
  if (type === 'select') return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" ${req}><option value="">Choisir…</option>${options.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>`;
  if (type === 'textarea') return `<div class="field"><label for="f-${name}">${label}</label><textarea id="f-${name}" ${req}></textarea></div>`;
  return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" type="${type}" ${type === 'number' ? 'inputmode="decimal" min="0" step="any"' : ''} ${req}></div>`;
}

function openEditor(type, id = null) {
  if (type === 'goal' && !id && db.goals.length >= 3) { toast('Trois résultats maximum.'); return; }
  const collection = db[keyFor(type)];
  if (!collection || !templates[type]) { toast('Module indisponible.'); return; }
  const item = id ? collection.find((x) => x.id === id) : {};
  editing = { type, id };
  const labels = { task:'Tâche', goal:'Résultat', admin:'Démarche', finance:'Mouvement', jobs:'Emploi', gco:'Projet GCO', idea:'Idée', checkin:'Bilan' };
  $('#formTitle').textContent = `${id ? 'Modifier' : 'Ajouter'} : ${labels[type]}`;
  $('#formKicker').textContent = id ? 'Mise à jour' : 'Nouvel élément';
  $('#fields').innerHTML = templates[type].map(fieldHtml).join('');
  templates[type].forEach(([name]) => {
    const element = $(`#f-${name}`);
    let value = item?.[name] ?? '';
    if (!id && name === 'date') value = iso();
    const defaults = { task:{status:'À faire'}, goal:{status:'Planifié'}, admin:{status:'À faire'}, finance:{paid:'Non'}, gco:{status:'Planifié'}, idea:{decision:'À revoir'} };
    if (!id && defaults[type]?.[name]) value = defaults[type][name];
    element.value = value;
  });
  $('#editor').showModal();
}

$('#editorForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!editing) return;
  const { type, id } = editing;
  const collection = db[keyFor(type)];
  const object = { id: id || uid() };
  for (const [name,,kind,required] of templates[type]) {
    const element = $(`#f-${name}`);
    const raw = String(element.value ?? '');
    if (required && !raw.trim()) { element.focus(); toast('Champ obligatoire manquant.'); return; }
    object[name] = kind === 'number' ? (raw === '' ? '' : Number(raw)) : raw.trim();
  }
  if (id) {
    const index = collection.findIndex((x) => x.id === id);
    if (index >= 0) collection[index] = { ...collection[index], ...object };
  } else {
    collection.unshift(object);
  }
  $('#editor').close();
  editing = null;
  save(id ? 'Élément mis à jour.' : 'Élément ajouté.');
});

function go(view) {
  $$('.view').forEach((x) => x.classList.toggle('active', x.id === view));
  $$('.bottom-nav button').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  window.scrollTo({ top:0, behavior:'smooth' });
}

document.addEventListener('click', (event) => {
  let node;
  if ((node = event.target.closest('[data-view]'))) return go(node.dataset.view);
  if ((node = event.target.closest('[data-go]'))) return go(node.dataset.go);
  if ((node = event.target.closest('[data-energy]'))) { db.profile.energy = node.dataset.energy; return save('Énergie enregistrée.'); }
  if ((node = event.target.closest('[data-add]'))) return openEditor(node.dataset.add);
  if ((node = event.target.closest('[data-edit]'))) return openEditor(node.dataset.edit, node.dataset.id);
  if ((node = event.target.closest('[data-delete]'))) {
    if (confirm('Supprimer définitivement cet élément ?')) {
      const key = keyFor(node.dataset.delete);
      db[key] = db[key].filter((x) => x.id !== node.dataset.id);
      save('Élément supprimé.');
    }
    return;
  }
  if ((node = event.target.closest('[data-done]'))) { const item=db.tasks.find((x) => x.id === node.dataset.done); if (item) item.status='Terminé'; return save('Tâche terminée.'); }
  if ((node = event.target.closest('[data-reopen]'))) { const item=db.tasks.find((x) => x.id === node.dataset.reopen); if (item) item.status='À faire'; return save('Tâche rouverte.'); }
  if ((node = event.target.closest('[data-filter]'))) { filter=node.dataset.filter; $$('[data-filter]').forEach((b) => b.classList.toggle('active', b===node)); return renderTasks(); }
  if ((node = event.target.closest('[data-module]'))) { activeModule=node.dataset.module; return renderModule(); }
  if ((node = event.target.closest('[data-close]'))) { $(`#${node.dataset.close}`).close(); return; }
});

$('#moduleAdd').addEventListener('click', () => openEditor(activeModule === 'ideas' ? 'idea' : activeModule));
$('#backupBtn').addEventListener('click', () => $('#settingsDialog').showModal());
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(db,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `cockpit-gabriel-${iso()}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  toast('Sauvegarde exportée.');
});
$('#importInput').addEventListener('change', async (event) => {
  try {
    const file = event.target.files?.[0]; if (!file) return;
    db = { ...emptyDb(), ...JSON.parse(await file.text()) };
    save('Sauvegarde restaurée.');
    $('#settingsDialog').close();
  } catch (_) { toast('Fichier invalide.'); }
  event.target.value = '';
});
$('#resetBtn').addEventListener('click', () => {
  if (confirm('Effacer toutes les données ?')) {
    db = emptyDb();
    try { localStorage.removeItem(KEY); } catch (_) {}
    try { sessionStorage.removeItem(KEY); } catch (_) {}
    render();
    $('#settingsDialog').close();
    toast('Cockpit réinitialisé.');
  }
});

render();
