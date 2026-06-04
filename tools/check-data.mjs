#!/usr/bin/env node
// Static data integrity check for the web app's built-in program JSON.
//
// Verifies that web/data/built-in-programs.json exists, parses, stays in sync
// with the SwiftUI source of truth, and that every segment has the fields the
// web UI relies on. Exits non-zero (with a readable report) on any problem.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizePrograms,
  SPRING_COLORS,
  MOVEMENT_TYPES,
  SIDES,
  DIFFICULTIES,
} from '../src/programs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..');

const dataPath = path.join(webRoot, 'data', 'built-in-programs.json');
const sourcePath = path.join(repoRoot, 'MicroformerCoach', 'Resources', 'BuiltInPrograms.json');
const requiredAssets = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'src/app.mjs',
  'src/programs.mjs',
  'src/session.mjs',
  'data/built-in-programs.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function readJson(file) {
  if (!fs.existsSync(file)) {
    fail(`Missing file: ${path.relative(repoRoot, file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`Invalid JSON in ${path.relative(repoRoot, file)}: ${err.message}`);
    return null;
  }
}

const rawData = readJson(dataPath);

requiredAssets.forEach((asset) => {
  const fullPath = path.join(webRoot, asset);
  if (!fs.existsSync(fullPath)) fail(`Missing web asset: web/${asset}`);
});

// Confirm the static copy matches the Swift source of truth (if present).
if (fs.existsSync(sourcePath) && rawData) {
  const rawSource = readJson(sourcePath);
  if (rawSource && JSON.stringify(rawSource) !== JSON.stringify(rawData)) {
    warn(
      'web/data/built-in-programs.json differs from MicroformerCoach/Resources/BuiltInPrograms.json. ' +
        'Re-copy the source if it changed intentionally.',
    );
  }
}

let totalSegments = 0;

if (Array.isArray(rawData)) {
  if (rawData.length === 0) fail('No built-in programs found.');

  const programs = normalizePrograms(rawData);
  programs.forEach((program, pIndex) => {
    const label = `program[${pIndex}] "${program.name}"`;
    if (!program.name) fail(`${label}: missing name`);
    if (!DIFFICULTIES.includes(program.difficulty)) {
      fail(`${label}: invalid difficulty "${program.difficulty}"`);
    }
    if (program.focusAreas.length === 0) warn(`${label}: no focus areas`);
    if (!program.isBuiltIn) warn(`${label}: isBuiltIn is not true`);
    if (program.segments.length === 0) fail(`${label}: has no segments`);

    program.segments.forEach((seg, sIndex) => {
      const segLabel = `${label} segment[${sIndex}] "${seg.title}"`;
      totalSegments += 1;
      if (!seg.title) fail(`${segLabel}: missing title`);
      if (!(seg.durationSeconds > 0)) fail(`${segLabel}: duration must be > 0`);
      if (!MOVEMENT_TYPES.includes(seg.movementType)) {
        fail(`${segLabel}: invalid movementType "${seg.movementType}"`);
      }
      if (!SIDES.includes(seg.side)) fail(`${segLabel}: invalid side "${seg.side}"`);
      if (!seg.spring || !Array.isArray(seg.spring.springs) || seg.spring.springs.length === 0) {
        fail(`${segLabel}: missing spring configuration`);
      } else {
        seg.spring.springs.forEach((s) => {
          if (!SPRING_COLORS.includes(s.color)) {
            fail(`${segLabel}: invalid spring color "${s.color}"`);
          }
        });
      }
      if (!seg.springLabel) fail(`${segLabel}: empty springLabel`);
    });
  });

  // Headline counts (the task documents 4 programs / 122 segments).
  console.log(`Programs: ${programs.length}`);
  console.log(`Segments: ${totalSegments}`);
  programs.forEach((p) => {
    console.log(
      `  - ${p.name} (${p.difficulty}) — ${p.segmentCount} segments, ${Math.round(p.durationSeconds / 60)} min`,
    );
  });
}

if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach((w) => console.log(`  ! ${w}`));
}

if (errors.length) {
  console.error('\nData check FAILED:');
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
}

console.log('\nData check passed.');
