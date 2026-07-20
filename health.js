'use strict';

/* Module État physique — extension du Cockpit Gabriel */
if (!Array.isArray(db.health)) {
  db.health = [];
  try { persist(); } catch (_) {}
}

const healthScaleFields = ['overall','fatigue','legs','thighs','headache','breathless','chest','sleep'];
const healthSymptoms = [
  ['fatigue','Fatigue'],
  ['legs','Jambes'],
  ['thighs','Cuisses'],
  ['headache','Maux de tête'],
  ['breathless','Essoufflement'],
  ['chest','Poitrine']
];

const healthSeverityClass = (value) => Number(value) >= 7 ? 'red' : Number(value) >= 4 ? 'orange' : Number(value) > 0 ? 'green' : '';
const healthSleepClass = (value) => Number(value) >= 7 ? 'green' : Number(value) >= 4 ? 'orange' : Number(value) > 0 ? 'red' : '';
const healthPeak = (entry) => Math.max(Number(entry.overall) || 0, ...healthSymptoms.map(([key]) => Number(entry[key]) || 0));

function healthRecent(entries, numberOfDays = 7) {
  return entries.filter((entry) => {
    const delta = days(entry.date);
    return delta !== null && delta <= 0 && delta >= -(numberOfDays - 1);
  });
}

function healthCard(entry) {
  const peak = healthPeak(entry);
  const overall = Number(entry.overall) || peak;
  const symptoms = healthSymptoms
    .map(([key,label]) => ({ label, value:Number(entry[key]) || 0 }))
    .filter((item) => item.value > 0)
    .sort((a,b) => b.value - a.value)
    .slice(0,5);
  const description = entry.otherSymptoms || entry.notes || entry.trigger || 'Aucun commentaire ajouté.';

  return `<article class="item health-item">
    <div class="item-top">
      <div><h3>${fmt(entry.date)}</h3><p class="muted">${esc(description)}</p></div>
      ${badge(`Gêne ${overall}/10`,healthSeverityClass(overall))}
    </div>
    <div class="badges">
      ${symptoms.map((item) => badge(`${item.label} ${item.value}/10`,healthSeverityClass(item.value))).join('')}
      ${entry.sleep !== '' && entry.sleep != null ? badge(`Sommeil ${entry.sleep}/10`,healthSleepClass(entry.sleep)) : ''}
      ${entry.trigger ? badge(`Déclencheur : ${entry.trigger}`,'blue') : ''}
    </div>
    ${actions('health',entry.id)}
  </article>`;
}

function renderHealthModule() {
  const list = Array.isArray(db.health) ? [...db.health].sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))) : [];
  const recent = healthRecent(list,7);
  const average = recent.length ? (recent.reduce((sum,entry) => sum + (Number(entry.overall) || healthPeak(entry)),0) / recent.length).toFixed(1) : '0';
  const peak = recent.length ? Math.max(...recent.map(healthPeak)) : 0;

  $('#moduleTitle').textContent = 'État physique';
  $$('[data-module]').forEach((button) => button.classList.toggle('active',button.dataset.module === 'health'));
  $('#moduleSummary').innerHTML = [
    [list.length,'Relevés'],
    [`${average}/10`,'Moy. 7 j'],
    [`${peak}/10`,'Pic 7 j']
  ].map(([value,label]) => `<div class="sum"><b>${value}</b><small>${label}</small></div>`).join('');

  const notice = $('#moduleNotice');
  if (notice) {
    notice.hidden = false;
    notice.textContent = 'Ce journal aide à observer l’évolution. Il ne remplace pas un avis médical. Une douleur thoracique nouvelle ou intense, une difficulté importante à respirer, une faiblesse inhabituelle ou un mal de tête brutal nécessitent une aide médicale urgente.';
  }

  $('#moduleList').innerHTML = list.length
    ? list.map(healthCard).join('')
    : emptyCard('Aucun relevé physique','Ajoute un relevé pour suivre tes douleurs, ta fatigue et les autres symptômes dans le temps.');
}

templates.health = [
  ['date','Date','date',true],
  ['overall','Gêne physique globale /10 — 0 aucune, 10 maximale','number',true],
  ['fatigue','Fatigue /10','number'],
  ['legs','Douleurs jambes /10','number'],
  ['thighs','Douleurs cuisses /10','number'],
  ['headache','Maux de tête /10','number'],
  ['breathless','Essoufflement /10','number'],
  ['chest','Douleur thoracique /10','number'],
  ['sleep','Qualité du sommeil /10 — 0 très mauvaise, 10 excellente','number'],
  ['otherSymptoms','Autres symptômes','textarea'],
  ['trigger','Activité ou déclencheur possible','text'],
  ['notes','Notes / évolution / traitement pris','textarea']
];
moduleLabels.health = 'État physique';

const originalOpenEditorForHealth = openEditor;
openEditor = function patchedOpenEditor(type,id = null) {
  if (type === 'health' && !Array.isArray(db.health)) db.health = [];
  originalOpenEditorForHealth(type,id);
  if (type !== 'health' || !$('#editor').open) return;
  $('#formTitle').textContent = `${id ? 'Modifier' : 'Ajouter'} : État physique`;
  healthScaleFields.forEach((name) => {
    const input = $(`#f-${name}`);
    if (!input) return;
    input.min = '0';
    input.max = '10';
    input.step = '1';
    input.inputMode = 'numeric';
  });
};

const originalRenderModuleForHealth = renderModule;
renderModule = function patchedRenderModule() {
  const notice = $('#moduleNotice');
  if (activeModule === 'health') return renderHealthModule();
  if (notice) {
    notice.hidden = true;
    notice.textContent = '';
  }
  return originalRenderModuleForHealth();
};

const originalRenderCheckinsForHealth = renderCheckins;
renderCheckins = function patchedRenderCheckins() {
  originalRenderCheckinsForHealth();
  const recent = healthRecent(Array.isArray(db.health) ? db.health : [],7);
  const average = recent.length ? (recent.reduce((sum,entry) => sum + (Number(entry.overall) || healthPeak(entry)),0) / recent.length).toFixed(1) : '0';
  const cards = $$('#reviewKpis .kpi');
  if (cards.length >= 4) cards[3].innerHTML = `<small>Gêne physique</small><b>${average}/10</b><span class="muted">7 derniers jours</span>`;
};

$('#resetBtn').addEventListener('click', () => {
  queueMicrotask(() => {
    if (!Array.isArray(db.health)) db.health = [];
    try { persist(); } catch (_) {}
    render();
  });
});

render();
