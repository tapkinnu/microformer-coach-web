// Microformer Coach — vanilla ES-module PWA controller.
// Views: program library -> program detail -> live instructor session, plus a
// program editor. Custom programs persist in localStorage.

import {
  normalizePrograms,
  hydrateStoredPrograms,
  serializeProgramsForStorage,
  createEmptyProgram,
  createEmptySegment,
  summarizeProgram,
  formatDuration,
  springLabel,
  programDuration,
  SPRING_COLORS,
  MOVEMENT_TYPES,
  SIDES,
  DIFFICULTIES,
} from './programs.mjs';
import {
  createSessionState,
  tickSession,
  skipToNextSegment,
  skipToPreviousSegment,
  restartSession,
  restartSegment,
  togglePause,
  progressFraction,
  totalDuration,
  elapsedDuration,
  formatTime,
} from './session.mjs';

const STORAGE_KEY = 'microformer.customPrograms.v1';
const appEl = document.getElementById('app');

const stateStore = {
  builtIns: [],
  customs: [],
};

// --- DOM helper -------------------------------------------------------------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

function mount(node) {
  appEl.replaceChildren(node);
}

// --- persistence ------------------------------------------------------------

function loadCustoms() {
  try {
    stateStore.customs = hydrateStoredPrograms(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    stateStore.customs = [];
  }
}

function saveCustoms() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeProgramsForStorage(stateStore.customs));
  } catch (err) {
    console.warn('Could not persist custom programs', err);
  }
}

function allPrograms() {
  return [...stateStore.builtIns, ...stateStore.customs];
}

function findProgram(id) {
  return allPrograms().find((p) => p.id === id) || null;
}

function cloneProgram(program) {
  return JSON.parse(JSON.stringify(program));
}

// --- shared UI bits ---------------------------------------------------------

function header(title, { backTo, actions } = {}) {
  return h(
    'header',
    { class: 'topbar' },
    backTo ? h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: backTo }, '‹') : h('span', { class: 'icon-btn ghost' }),
    h('h1', { class: 'topbar-title' }, title),
    h('div', { class: 'topbar-actions' }, ...(actions || [])),
  );
}

function chip(text, cls = '') {
  return h('span', { class: `chip ${cls}` }, text);
}

function difficultyBadge(difficulty) {
  return h('span', { class: `badge badge-${difficulty}` }, difficulty);
}

// --- Library view -----------------------------------------------------------

function programCard(program) {
  const focus = program.focusAreas.slice(0, 3).map((f) => chip(f));
  return h(
    'button',
    { class: 'card', onclick: () => showDetail(program.id) },
    h(
      'div',
      { class: 'card-head' },
      h('h2', { class: 'card-title' }, program.name),
      difficultyBadge(program.difficulty),
    ),
    program.subtitle ? h('p', { class: 'card-sub' }, program.subtitle) : null,
    h('p', { class: 'card-meta' }, summarizeProgram(program)),
    focus.length ? h('div', { class: 'chip-row' }, ...focus) : null,
    !program.isBuiltIn
      ? h(
          'div',
          { class: 'card-actions' },
          h(
            'span',
            {
              class: 'mini-btn',
              role: 'button',
              onclick: (e) => {
                e.stopPropagation();
                editProgram(program.id);
              },
            },
            'Edit',
          ),
          h(
            'span',
            {
              class: 'mini-btn danger',
              role: 'button',
              onclick: (e) => {
                e.stopPropagation();
                deleteProgram(program.id);
              },
            },
            'Delete',
          ),
        )
      : null,
  );
}

function showLibrary() {
  stopTimer();
  const newBtn = h('button', { class: 'pill-btn', onclick: () => editProgram(null) }, '+ New');
  const sections = [];
  sections.push(h('h2', { class: 'section-title' }, 'Built-in programs'));
  sections.push(h('div', { class: 'card-list' }, ...stateStore.builtIns.map(programCard)));
  sections.push(h('h2', { class: 'section-title' }, 'My programs'));
  if (stateStore.customs.length) {
    sections.push(h('div', { class: 'card-list' }, ...stateStore.customs.map(programCard)));
  } else {
    sections.push(
      h('p', { class: 'empty' }, 'No custom programs yet. Tap “+ New” to build a class.'),
    );
  }

  mount(
    h(
      'div',
      { class: 'view' },
      header('Microformer Coach', { actions: [newBtn] }),
      h('div', { class: 'scroll' }, ...sections),
    ),
  );
}

// --- Detail view ------------------------------------------------------------

function segmentRow(seg, index) {
  return h(
    'div',
    { class: `seg-row${seg.isTransition ? ' is-transition' : ''}` },
    h('span', { class: 'seg-index' }, String(index + 1)),
    h(
      'div',
      { class: 'seg-main' },
      h('div', { class: 'seg-title' }, seg.title, seg.side !== 'bilateral' ? chip(seg.side, 'tiny') : null),
      h(
        'div',
        { class: 'seg-sub' },
        h('span', { class: 'seg-time' }, formatDuration(seg.durationSeconds)),
        h('span', { class: 'dot' }, '·'),
        h('span', { class: 'seg-spring' }, seg.springLabel),
      ),
      seg.transitionNote ? h('div', { class: 'seg-note' }, `→ ${seg.transitionNote}`) : null,
    ),
  );
}

function showDetail(id) {
  stopTimer();
  const program = findProgram(id);
  if (!program) return showLibrary();

  const actions = [];
  if (!program.isBuiltIn) {
    actions.push(h('button', { class: 'pill-btn ghost', onclick: () => editProgram(id) }, 'Edit'));
  }

  mount(
    h(
      'div',
      { class: 'view' },
      header(program.name, { backTo: showLibrary, actions }),
      h(
        'div',
        { class: 'scroll' },
        program.subtitle ? h('p', { class: 'detail-sub' }, program.subtitle) : null,
        h(
          'div',
          { class: 'detail-meta' },
          difficultyBadge(program.difficulty),
          chip(`${program.segmentCount} movements`),
          chip(formatDuration(program.durationSeconds)),
        ),
        program.focusAreas.length
          ? h('div', { class: 'chip-row' }, ...program.focusAreas.map((f) => chip(f)))
          : null,
        h(
          'button',
          {
            class: 'start-btn',
            disabled: program.segmentCount === 0 || undefined,
            onclick: () => startSession(id),
          },
          '▶ Start Class',
        ),
        h('h2', { class: 'section-title' }, 'Movements'),
        h('div', { class: 'seg-list' }, ...program.segments.map(segmentRow)),
      ),
    ),
  );
}

// --- Live session view ------------------------------------------------------

let session = null;
let timerId = null;
let lastRenderedIndex = -1;
const sessionRefs = {};

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    if (!session || session.isPaused || session.isFinished) return;
    session = tickSession(session, 1);
    refreshSession();
  }, 1000);
}

function infoBlock(label, items, cls) {
  if (!items || !items.length) return null;
  return h(
    'div',
    { class: `info-block ${cls}` },
    h('h3', { class: 'info-label' }, label),
    h('ul', { class: 'info-list' }, ...items.map((t) => h('li', {}, t))),
  );
}

function refreshMovement() {
  const seg = session.program.segments[session.currentIndex];
  const upcoming = session.program.segments[session.currentIndex + 1] || null;

  const panel = h(
    'div',
    { class: 'move-panel' },
    h(
      'div',
      { class: 'move-head' },
      seg.isTransition ? chip('Transition', 'warn') : null,
      h('span', { class: 'spring-badge' }, seg.springLabel),
      seg.side !== 'bilateral' ? chip(seg.side, 'side') : null,
    ),
    h('h2', { class: 'move-title' }, seg.title),
    seg.focusArea ? h('p', { class: 'move-focus' }, seg.focusArea) : null,
    seg.position ? infoBlock('Position / setup', [seg.position], 'position') : null,
    seg.details ? infoBlock('Details', [seg.details], 'details') : null,
    infoBlock('Cues', seg.cues, 'cues'),
    infoBlock('Corrections', seg.corrections, 'corrections'),
    infoBlock('Variations', seg.variations, 'variations'),
    seg.transitionNote ? infoBlock('Transition', [seg.transitionNote], 'transition') : null,
    upcoming
      ? h(
          'div',
          { class: 'upcoming' },
          h('span', { class: 'upcoming-label' }, 'Up next'),
          h('span', { class: 'upcoming-title' }, upcoming.title),
          h('span', { class: 'upcoming-meta' }, `${formatDuration(upcoming.durationSeconds)} · ${upcoming.springLabel}`),
        )
      : h('div', { class: 'upcoming final' }, 'Final movement'),
  );
  sessionRefs.movement.replaceChildren(panel);
  lastRenderedIndex = session.currentIndex;
}

function refreshSession() {
  if (session.currentIndex !== lastRenderedIndex) refreshMovement();

  sessionRefs.timer.textContent = formatTime(session.remainingSeconds);
  sessionRefs.counter.textContent = `${session.currentIndex + 1} / ${session.program.segments.length}`;
  sessionRefs.elapsed.textContent = `${formatTime(elapsedDuration(session))} / ${formatTime(
    totalDuration(session.program),
  )}`;
  sessionRefs.progress.style.width = `${(progressFraction(session) * 100).toFixed(1)}%`;

  const root = sessionRefs.root;
  root.classList.toggle('is-paused', session.isPaused);
  root.classList.toggle('is-finished', session.isFinished);
  sessionRefs.pauseBtn.textContent = session.isPaused ? '▶' : '⏸';
  sessionRefs.timer.classList.toggle('low', !session.isFinished && session.remainingSeconds <= 5);

  if (session.isFinished) {
    sessionRefs.timer.textContent = 'Done';
  }
}

function startSession(id) {
  const program = findProgram(id);
  if (!program || program.segmentCount === 0) return;
  session = createSessionState(program);
  lastRenderedIndex = -1;

  sessionRefs.timer = h('div', { class: 'big-timer' }, '0:00');
  sessionRefs.counter = h('span', { class: 'seg-counter' }, '');
  sessionRefs.elapsed = h('span', { class: 'elapsed' }, '');
  sessionRefs.progress = h('div', { class: 'progress-fill' });
  sessionRefs.movement = h('div', { class: 'move-host' });
  sessionRefs.pauseBtn = h(
    'button',
    { class: 'ctl ctl-primary', 'aria-label': 'Pause', onclick: onPause },
    '⏸',
  );

  const controls = h(
    'div',
    { class: 'controls' },
    h('button', { class: 'ctl', 'aria-label': 'Previous', onclick: onPrev }, '⏮'),
    sessionRefs.pauseBtn,
    h('button', { class: 'ctl', 'aria-label': 'Next', onclick: onNext }, '⏭'),
    h('button', { class: 'ctl', 'aria-label': 'Restart', onclick: onRestart }, '↻'),
  );

  const root = h(
    'div',
    { class: 'view session' },
    h(
      'header',
      { class: 'topbar session-bar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Exit', onclick: () => showDetail(id) }, '✕'),
      h('div', { class: 'session-meta' }, sessionRefs.counter, sessionRefs.elapsed),
      h('span', { class: 'icon-btn ghost' }),
    ),
    h('div', { class: 'progress-track' }, sessionRefs.progress),
    sessionRefs.timer,
    h('div', { class: 'scroll session-scroll' }, sessionRefs.movement),
    controls,
  );
  sessionRefs.root = root;

  mount(root);
  refreshSession();
  startTimer();
  requestWakeLock();
}

function onPause() {
  session = togglePause(session);
  refreshSession();
}
function onNext() {
  session = skipToNextSegment(session);
  refreshSession();
}
function onPrev() {
  session = skipToPreviousSegment(session);
  refreshSession();
}
function onRestart() {
  session = restartSegment(session);
  refreshSession();
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    /* non-fatal */
  }
}

// --- Editor -----------------------------------------------------------------

let draft = null; // working copy of program being edited
let draftIsNew = false;

function editProgram(id) {
  stopTimer();
  if (id) {
    const program = findProgram(id);
    if (!program || program.isBuiltIn) return showLibrary();
    draft = cloneProgram(program);
    draftIsNew = false;
  } else {
    draft = createEmptyProgram({ name: 'New Program' });
    draftIsNew = true;
  }
  renderEditor();
}

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}

function renderEditor() {
  const nameInput = h('input', {
    class: 'input',
    value: draft.name,
    placeholder: 'Program name',
    oninput: (e) => {
      draft.name = e.target.value;
    },
  });
  const subInput = h('input', {
    class: 'input',
    value: draft.subtitle || '',
    placeholder: 'Subtitle',
    oninput: (e) => {
      draft.subtitle = e.target.value;
    },
  });
  const diffSelect = h(
    'select',
    {
      class: 'input',
      onchange: (e) => {
        draft.difficulty = e.target.value;
      },
    },
    ...DIFFICULTIES.map((d) => h('option', { value: d, selected: draft.difficulty === d || undefined }, d)),
  );
  const focusInput = h('input', {
    class: 'input',
    value: (draft.focusAreas || []).join(', '),
    placeholder: 'Core, Legs, Obliques',
    oninput: (e) => {
      draft.focusAreas = e.target.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    },
  });

  const segList = h(
    'div',
    { class: 'edit-seg-list' },
    ...draft.segments.map((seg, i) => editorSegmentRow(seg, i)),
  );
  if (draft.segments.length === 0) {
    segList.append(h('p', { class: 'empty' }, 'No segments yet. Add your first movement.'));
  }

  const actions = [
    h('button', { class: 'pill-btn', onclick: saveDraft }, 'Save'),
  ];

  mount(
    h(
      'div',
      { class: 'view' },
      header(draftIsNew ? 'New Program' : 'Edit Program', { backTo: cancelDraft, actions }),
      h(
        'div',
        { class: 'scroll' },
        field('Name', nameInput),
        field('Subtitle', subInput),
        field('Difficulty', diffSelect),
        field('Focus areas (comma-separated)', focusInput),
        h(
          'div',
          { class: 'seg-edit-head' },
          h('h2', { class: 'section-title' }, 'Movements'),
          h('button', { class: 'pill-btn ghost', onclick: () => editSegment(null) }, '+ Add'),
        ),
        segList,
      ),
    ),
  );
}

function editorSegmentRow(seg, index) {
  return h(
    'div',
    { class: 'edit-seg' },
    h(
      'div',
      { class: 'edit-seg-main', onclick: () => editSegment(index) },
      h('span', { class: 'seg-index' }, String(index + 1)),
      h(
        'div',
        { class: 'seg-main' },
        h('div', { class: 'seg-title' }, seg.title),
        h('div', { class: 'seg-sub' }, `${formatDuration(seg.durationSeconds)} · ${springLabel(seg.spring)}`),
      ),
    ),
    h(
      'div',
      { class: 'edit-seg-ctl' },
      h('button', { class: 'mini-btn', disabled: index === 0 || undefined, onclick: () => moveSegment(index, -1) }, '↑'),
      h(
        'button',
        { class: 'mini-btn', disabled: index === draft.segments.length - 1 || undefined, onclick: () => moveSegment(index, 1) },
        '↓',
      ),
      h('button', { class: 'mini-btn danger', onclick: () => deleteSegment(index) }, '✕'),
    ),
  );
}

function moveSegment(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= draft.segments.length) return;
  const [seg] = draft.segments.splice(index, 1);
  draft.segments.splice(target, 0, seg);
  renderEditor();
}

function deleteSegment(index) {
  draft.segments.splice(index, 1);
  renderEditor();
}

function saveDraft() {
  if (!draft.name.trim()) draft.name = 'Untitled program';
  // Recompute derived data via normalize so the stored shape is canonical.
  const [normalized] = normalizePrograms([{ ...draft, isBuiltIn: false }]);
  normalized.id = draft.id;
  const existing = stateStore.customs.findIndex((p) => p.id === draft.id);
  if (existing >= 0) stateStore.customs[existing] = normalized;
  else stateStore.customs.push(normalized);
  saveCustoms();
  draft = null;
  showDetail(normalized.id);
}

function cancelDraft() {
  draft = null;
  showLibrary();
}

function deleteProgram(id) {
  const program = findProgram(id);
  if (!program) return;
  if (!confirm(`Delete “${program.name}”? This cannot be undone.`)) return;
  stateStore.customs = stateStore.customs.filter((p) => p.id !== id);
  saveCustoms();
  showLibrary();
}

// --- Segment editor ---------------------------------------------------------

let segDraft = null;
let segDraftIndex = null;

function editSegment(index) {
  segDraftIndex = index;
  if (index == null) {
    segDraft = createEmptySegment();
  } else {
    segDraft = cloneProgram(draft.segments[index]); // deep clone
  }
  renderSegmentEditor();
}

function springEditorRows() {
  const host = h('div', { class: 'spring-rows' });
  const render = () => {
    host.replaceChildren(
      ...segDraft.spring.springs.map((sp, i) =>
        h(
          'div',
          { class: 'spring-row' },
          h(
            'select',
            {
              class: 'input',
              onchange: (e) => {
                sp.color = e.target.value;
              },
            },
            ...SPRING_COLORS.map((c) => h('option', { value: c, selected: sp.color === c || undefined }, c)),
          ),
          h('input', {
            class: 'input num',
            type: 'number',
            min: '1',
            value: sp.count,
            oninput: (e) => {
              sp.count = Math.max(1, parseInt(e.target.value, 10) || 1);
            },
          }),
          h(
            'button',
            {
              class: 'mini-btn danger',
              onclick: () => {
                segDraft.spring.springs.splice(i, 1);
                render();
              },
            },
            '✕',
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'pill-btn ghost',
          onclick: () => {
            segDraft.spring.springs.push({ color: 'black', count: 1 });
            render();
          },
        },
        '+ Spring',
      ),
    );
  };
  render();
  return host;
}

function listTextarea(label, key) {
  return field(
    `${label} (one per line)`,
    h('textarea', {
      class: 'input area',
      rows: '3',
      oninput: (e) => {
        segDraft[key] = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
      },
      html: '',
    }, (segDraft[key] || []).join('\n')),
  );
}

function renderSegmentEditor() {
  const titleInput = h('input', {
    class: 'input',
    value: segDraft.title,
    oninput: (e) => {
      segDraft.title = e.target.value;
    },
  });
  const durInput = h('input', {
    class: 'input',
    type: 'number',
    min: '1',
    value: segDraft.durationSeconds,
    oninput: (e) => {
      segDraft.durationSeconds = Math.max(1, parseInt(e.target.value, 10) || 0);
    },
  });
  const noteInput = h('input', {
    class: 'input',
    value: segDraft.spring.note || '',
    placeholder: 'e.g. start light',
    oninput: (e) => {
      const v = e.target.value.trim();
      if (v) segDraft.spring.note = v;
      else delete segDraft.spring.note;
    },
  });
  const focusInput = h('input', {
    class: 'input',
    value: segDraft.focusArea || '',
    oninput: (e) => {
      segDraft.focusArea = e.target.value;
    },
  });
  const positionInput = h('textarea', {
    class: 'input area',
    rows: '2',
    oninput: (e) => {
      segDraft.position = e.target.value;
    },
    html: '',
  }, segDraft.position || '');
  const detailsInput = h('textarea', {
    class: 'input area',
    rows: '2',
    oninput: (e) => {
      segDraft.details = e.target.value;
    },
    html: '',
  }, segDraft.details || '');
  const sideSelect = h(
    'select',
    { class: 'input', onchange: (e) => { segDraft.side = e.target.value; } },
    ...SIDES.map((s) => h('option', { value: s, selected: segDraft.side === s || undefined }, s)),
  );
  const typeSelect = h(
    'select',
    { class: 'input', onchange: (e) => { segDraft.movementType = e.target.value; } },
    ...MOVEMENT_TYPES.map((t) => h('option', { value: t, selected: segDraft.movementType === t || undefined }, t)),
  );
  const transitionChk = h('input', {
    type: 'checkbox',
    checked: segDraft.isTransition || undefined,
    onchange: (e) => { segDraft.isTransition = e.target.checked; },
  });
  const transNoteInput = h('input', {
    class: 'input',
    value: segDraft.transitionNote || '',
    oninput: (e) => { segDraft.transitionNote = e.target.value; },
  });

  mount(
    h(
      'div',
      { class: 'view' },
      header(segDraftIndex == null ? 'New Movement' : 'Edit Movement', {
        backTo: renderEditor,
        actions: [h('button', { class: 'pill-btn', onclick: saveSegment }, 'Done')],
      }),
      h(
        'div',
        { class: 'scroll' },
        field('Title', titleInput),
        field('Duration (seconds)', durInput),
        field('Springs', springEditorRows()),
        field('Spring note', noteInput),
        field('Focus / body area', focusInput),
        field('Position / setup', positionInput),
        field('Details', detailsInput),
        listTextarea('Cues', 'cues'),
        listTextarea('Corrections', 'corrections'),
        listTextarea('Variations', 'variations'),
        field('Side', sideSelect),
        field('Movement type (animation)', typeSelect),
        h('label', { class: 'field row' }, transitionChk, h('span', { class: 'field-label' }, 'Is a transition / spring change')),
        field('Transition note', transNoteInput),
      ),
    ),
  );
}

function saveSegment() {
  if (!segDraft.title.trim()) segDraft.title = 'Untitled movement';
  if (!segDraft.spring.springs.length) segDraft.spring.springs.push({ color: 'black', count: 1 });
  if (segDraftIndex == null) draft.segments.push(segDraft);
  else draft.segments[segDraftIndex] = segDraft;
  segDraft = null;
  segDraftIndex = null;
  renderEditor();
}

// --- bootstrap --------------------------------------------------------------

async function loadBuiltIns() {
  try {
    const res = await fetch('data/built-in-programs.json', { cache: 'no-cache' });
    const raw = await res.json();
    stateStore.builtIns = normalizePrograms(raw);
  } catch (err) {
    console.error('Failed to load built-in programs', err);
    stateStore.builtIns = [];
  }
}

async function init() {
  loadCustoms();
  await loadBuiltIns();
  showLibrary();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  }
}

init();
