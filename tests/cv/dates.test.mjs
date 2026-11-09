import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('src/lib/cv/dates.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseCvDates, serializeCvDates, formatCvDates, invalidCvDates } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
test('numeric and bilingual dates become separate fields without inventing months', () => {
 assert.equal(parseCvDates('02/2025 – Present').startMonth, '2');
 assert.equal(parseCvDates('02/2025 – Present').current, true);
 assert.equal(serializeCvDates(parseCvDates('Apr 2024 - Dec 2024')), '04/2024 – 12/2024');
 assert.equal(serializeCvDates(parseCvDates('ene 2018 – jun 2022')), '01/2018 – 06/2022');
 assert.equal(serializeCvDates(parseCvDates('2020')), '2020');
 assert.equal(formatCvDates('2020 – 2021', false, true), '2020 – 2021');
 assert.equal(parseCvDates('Curso de verano'), null);
 assert.equal(formatCvDates('Curso de verano', false), 'Curso de verano');
});
test('reversed ranges and current roles without a start are rejected', () => {
 assert.equal(invalidCvDates('12/2024 – 04/2024'), true);
 assert.equal(invalidCvDates('2025 – 2024'), true);
 assert.equal(invalidCvDates('– Present'), true);
 assert.equal(invalidCvDates('04/2024 – 04/2024'), false);
 assert.equal(invalidCvDates(''), false);
 assert.equal(invalidCvDates('2020 – 2021'), true);
 assert.equal(invalidCvDates('02/2025 – Present'), false);
 assert.equal(invalidCvDates('02/2025'), true);
});
test('public dates use inclusive month durations only with sufficient precision', () => {
 const now = new Date(2026, 10, 8);
 assert.equal(formatCvDates('04/2024 – 12/2024', false, true, now), 'abr 2024 – dic 2024 · 9 meses');
 assert.equal(formatCvDates('02/2025 – Present', false, true, now), 'feb 2025 – Actualidad · 1 año 10 meses');
 assert.equal(formatCvDates('04/2024 – 12/2024', true, true, now), 'Apr 2024 – Dec 2024 · 9 months');
 assert.equal(formatCvDates('2024 – Present', false, true, now), '2024 – Actualidad');
 assert.equal(formatCvDates('04/2027 – 12/2027', false, true, now), 'abr 2027 – dic 2027');
});
