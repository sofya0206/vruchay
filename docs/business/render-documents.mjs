#!/usr/bin/env node
/**
 * Сборка документов из болванок и реквизитов.
 *
 * Зачем отдельный скрипт, а не просто вписать данные в шаблоны: адрес регистрации
 * ИП — это домашний адрес человека, и в репозиторий он попадать не должен.
 * Болванки остаются чистыми и версионируются, реквизиты лежат в gitignore,
 * готовые документы собираются одной командой и тоже не коммитятся.
 *
 * Запуск:  node docs/business/render-documents.mjs
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REQUISITES = join(here, 'requisites.md');
const TEMPLATES = join(here, 'templates');
const OUTPUT = join(here, 'generated');

if (!existsSync(REQUISITES)) {
  console.error(
    'Не найден файл requisites.md.\n' +
      'Скопируйте requisites.example.md в requisites.md и заполните реальными значениями.',
  );
  process.exit(1);
}

/** Реквизиты лежат в блоке кода в виде «КЛЮЧ: значение». */
function readRequisites() {
  const text = readFileSync(REQUISITES, 'utf8');
  const block = /```(?:yaml)?\n([\s\S]*?)```/.exec(text);
  if (!block) {
    console.error('В requisites.md не найден блок кода с реквизитами');
    process.exit(1);
  }
  const values = {};
  for (const line of block[1].split('\n')) {
    const m = /^([A-ZА-ЯЁ_]+):\s*(.+)$/.exec(line.trim());
    if (m) values[m[1]] = m[2].trim();
  }
  return values;
}

const values = readRequisites();

// Дата редакции — не реквизит, а момент сборки документа. Подставляется
// автоматически: иначе в договоре останется дата, когда болванку писали.
values.ДАТА_РЕДАКЦИИ ??= new Date().toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const unfilled = Object.entries(values).filter(([, v]) => v === 'УТОЧНИТЬ');
if (unfilled.length) {
  console.warn(`⚠ Не заполнено в реквизитах: ${unfilled.map(([k]) => k).join(', ')}`);
}

mkdirSync(OUTPUT, { recursive: true });

const templates = readdirSync(TEMPLATES).filter((f) => f.endsWith('.md') && f !== 'README.md');
let totalRemaining = 0;

for (const file of templates) {
  const source = readFileSync(join(TEMPLATES, file), 'utf8');

  // Блок с предупреждением «БОЛВАНКА» — внутренняя заметка для нас.
  // В документе, который уйдёт контрагенту, его быть не должно.
  const body = source.replace(/^> ⚠️[\s\S]*?\n\n/m, '');

  const filled = body.replace(/\{\{([A-ZА-ЯЁ_]+)\}\}/g, (all, key) =>
    values[key] && values[key] !== 'УТОЧНИТЬ' ? values[key] : all,
  );

  // Оставшиеся плейсхолдеры — данные конкретной сделки: их заполняют вручную
  // под каждого клиента, автоматизировать нечего.
  const remaining = [...new Set([...filled.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]))];
  totalRemaining += remaining.length;

  writeFileSync(join(OUTPUT, file), filled, 'utf8');
  const status = remaining.length ? `осталось заполнить: ${remaining.join(', ')}` : 'готов полностью';
  console.log(`✓ ${file} — ${status}`);
}

console.log(`\nДокументы собраны в docs/business/generated/ (папка не коммитится).`);
if (totalRemaining) {
  console.log('Оставшиеся плейсхолдеры заполняются под конкретную сделку.');
}
console.log('⚠ Перед подписанием документы должен проверить юрист.');
