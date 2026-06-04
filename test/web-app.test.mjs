import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizePrograms,
  createEmptyProgram,
  serializeProgramsForStorage,
  hydrateStoredPrograms,
  summarizeProgram,
} from '../src/programs.mjs';
import {
  createSessionState,
  tickSession,
  skipToNextSegment,
  formatTime,
} from '../src/session.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const rawBuiltIns = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'MicroformerCoach/Resources/BuiltInPrograms.json'), 'utf8'),
);

test('normalizes Swift-generated built-in program JSON for the web app', () => {
  const programs = normalizePrograms(rawBuiltIns);

  assert.equal(programs.length, 4);
  assert.equal(programs[0].name, 'Attached 45-Min Full Body Microformer');
  assert.equal(programs[0].segments.length, 60);
  assert.equal(programs[0].durationSeconds, 2700);
  assert.equal(programs[0].segments[0].springLabel, '1 black · start light');
  assert.equal(programs[0].segments[1].cues.includes('Slow is harder'), true);
});

test('creates editable custom programs and preserves them through localStorage serialization', () => {
  const custom = createEmptyProgram({ name: 'Friday Arms', subtitle: 'Studio custom', difficulty: 'intermediate' });
  custom.segments.push({
    title: 'Wheelbarrow Hold',
    durationSeconds: 75,
    spring: { springs: [{ color: 'black', count: 1 }] },
    focusArea: 'Core',
    position: 'Hands on front platform, feet on carriage.',
    details: 'Slow hold with carriage pulses.',
    cues: ['Shoulders wide'],
    corrections: [],
    variations: ['Knees down'],
    side: 'bilateral',
    movementType: 'core',
    isTransition: false,
  });

  const saved = serializeProgramsForStorage([custom]);
  const restored = hydrateStoredPrograms(saved);

  assert.equal(restored.length, 1);
  assert.equal(restored[0].isBuiltIn, false);
  assert.equal(restored[0].segments[0].springLabel, '1 black');
  assert.equal(summarizeProgram(restored[0]), '1 movement · 1:15');
});

test('session timer advances segments and exposes upcoming movement', () => {
  const [program] = normalizePrograms(rawBuiltIns);
  let state = createSessionState(program);

  assert.equal(state.currentSegment.title, 'Welcome & Setup');
  assert.equal(state.nextSegment.title, 'Seated Core Lean Back to Leg Extension');
  assert.equal(formatTime(state.remainingSeconds), '1:30');

  state = tickSession(state, 90);
  assert.equal(state.currentIndex, 1);
  assert.equal(state.currentSegment.title, 'Seated Core Lean Back to Leg Extension');
  assert.equal(formatTime(state.remainingSeconds), '1:00');

  state = skipToNextSegment(state);
  assert.equal(state.currentIndex, 2);
  assert.equal(state.currentSegment.title, 'Seated Core Twist');
  assert.equal(state.nextSegment.title, 'Seated Core Pulses');
});
