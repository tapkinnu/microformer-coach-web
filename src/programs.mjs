// Program data model + (de)serialization for the Microformer Coach web app.
//
// The built-in program JSON is produced by the SwiftUI app and lives at
// data/built-in-programs.json (a copy of MicroformerCoach/Resources/BuiltInPrograms.json).
// These helpers normalize that shape into the structure the web UI consumes and
// handle persisting user-created programs in localStorage.

export const SPRING_COLORS = ['black', 'white', 'grey'];
export const MOVEMENT_TYPES = [
  'generic',
  'core',
  'plank',
  'lunge',
  'innerThigh',
  'glute',
  'arms',
  'obliques',
];
export const SIDES = ['bilateral', 'left', 'right'];
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

/** Format a number of seconds as `m:ss` (e.g. 75 -> "1:15", 2700 -> "45:00"). */
export function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Human-readable spring label, e.g. "1 black · start light" or "1 white + 1 grey". */
export function springLabel(spring) {
  if (!spring || typeof spring !== 'object') return '';
  const springs = Array.isArray(spring.springs) ? spring.springs : [];
  const parts = springs
    .filter((s) => s && s.color && (s.count ?? 0) > 0)
    .map((s) => `${s.count} ${s.color}`);
  let label = parts.join(' + ');
  if (!label) label = 'No springs';
  if (spring.note) label += ` · ${spring.note}`;
  return label;
}

/** Total seconds across all of a program's segments. */
export function programDuration(program) {
  if (!program || !Array.isArray(program.segments)) return 0;
  return program.segments.reduce((sum, seg) => sum + (Number(seg.durationSeconds) || 0), 0);
}

/** Short program summary, e.g. "1 movement · 1:15" / "60 movements · 45:00". */
export function summarizeProgram(program) {
  const count = program?.segments?.length ?? 0;
  const noun = count === 1 ? 'movement' : 'movements';
  return `${count} ${noun} · ${formatDuration(programDuration(program))}`;
}

function randomId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value) {
  return String(value || 'program')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'program';
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
}

function normalizeSpring(spring) {
  const springs = Array.isArray(spring?.springs) ? spring.springs : [];
  const normalized = {
    springs: springs.map((s) => ({
      color: SPRING_COLORS.includes(s?.color) ? s.color : 'black',
      count: Math.max(1, Math.round(Number(s?.count) || 1)),
    })),
  };
  if (spring?.note) normalized.note = String(spring.note);
  return normalized;
}

/** Normalize a single raw segment, computing derived display fields. */
export function normalizeSegment(raw) {
  const spring = normalizeSpring(raw?.spring);
  return {
    id: raw?.id || randomId('seg'),
    title: String(raw?.title || 'Untitled movement'),
    durationSeconds: Math.max(0, Math.round(Number(raw?.durationSeconds) || 0)),
    spring,
    springLabel: springLabel(spring),
    focusArea: String(raw?.focusArea || ''),
    position: String(raw?.position || ''),
    details: String(raw?.details || ''),
    cues: normalizeStringList(raw?.cues),
    corrections: normalizeStringList(raw?.corrections),
    variations: normalizeStringList(raw?.variations),
    side: SIDES.includes(raw?.side) ? raw.side : 'bilateral',
    movementType: MOVEMENT_TYPES.includes(raw?.movementType) ? raw.movementType : 'generic',
    isTransition: Boolean(raw?.isTransition),
    transitionNote: raw?.transitionNote ? String(raw.transitionNote) : '',
  };
}

/** Normalize a single raw program (Swift JSON or stored custom) into the web shape. */
export function normalizeProgram(raw) {
  const segments = Array.isArray(raw?.segments) ? raw.segments.map(normalizeSegment) : [];
  const name = String(raw?.name || 'Untitled program');
  const durationSeconds = segments.reduce((sum, seg) => sum + seg.durationSeconds, 0);
  return {
    id: raw?.id || slugify(name),
    name,
    subtitle: String(raw?.subtitle || ''),
    difficulty: DIFFICULTIES.includes(raw?.difficulty) ? raw.difficulty : 'intermediate',
    focusAreas: normalizeStringList(raw?.focusAreas),
    isBuiltIn: Boolean(raw?.isBuiltIn),
    segments,
    durationSeconds,
    segmentCount: segments.length,
  };
}

/** Normalize an array of raw programs. */
export function normalizePrograms(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizeProgram);
}

/** Create a blank, editable custom program. */
export function createEmptyProgram({ name = 'New Program', subtitle = '', difficulty = 'intermediate', focusAreas = [] } = {}) {
  return {
    id: randomId('custom'),
    name,
    subtitle,
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'intermediate',
    focusAreas: normalizeStringList(focusAreas),
    isBuiltIn: false,
    segments: [],
  };
}

/** Create a blank, editable segment. */
export function createEmptySegment(overrides = {}) {
  return normalizeSegment({
    title: 'New Movement',
    durationSeconds: 60,
    spring: { springs: [{ color: 'black', count: 1 }] },
    focusArea: '',
    position: '',
    details: '',
    cues: [],
    corrections: [],
    variations: [],
    side: 'bilateral',
    movementType: 'generic',
    isTransition: false,
    ...overrides,
  });
}

// --- localStorage persistence ----------------------------------------------

function serializableSegment(seg) {
  const out = {
    id: seg.id,
    title: seg.title,
    durationSeconds: seg.durationSeconds,
    spring: normalizeSpring(seg.spring),
    focusArea: seg.focusArea,
    position: seg.position,
    details: seg.details,
    cues: normalizeStringList(seg.cues),
    corrections: normalizeStringList(seg.corrections),
    variations: normalizeStringList(seg.variations),
    side: seg.side,
    movementType: seg.movementType,
    isTransition: Boolean(seg.isTransition),
  };
  if (seg.transitionNote) out.transitionNote = seg.transitionNote;
  return out;
}

/**
 * Serialize custom programs into a JSON string suitable for localStorage.
 * Derived display fields (springLabel, durationSeconds) are dropped and
 * recomputed on hydrate so stored data stays minimal and authoritative.
 */
export function serializeProgramsForStorage(programs) {
  const list = (Array.isArray(programs) ? programs : []).map((p) => ({
    id: p.id || randomId('custom'),
    name: p.name,
    subtitle: p.subtitle || '',
    difficulty: p.difficulty || 'intermediate',
    focusAreas: normalizeStringList(p.focusAreas),
    isBuiltIn: false,
    segments: (Array.isArray(p.segments) ? p.segments : []).map(serializableSegment),
  }));
  return JSON.stringify(list);
}

/** Hydrate stored custom programs (a JSON string or already-parsed array). */
export function hydrateStoredPrograms(stored) {
  let parsed = stored;
  if (typeof stored === 'string') {
    if (!stored.trim()) return [];
    try {
      parsed = JSON.parse(stored);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((raw) => normalizeProgram({ ...raw, isBuiltIn: false }));
}
