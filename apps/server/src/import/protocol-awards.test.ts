import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyAwardRules, blockingIssues, NO_AWARD_STATUSES } from '@gramota/shared';
import type { AwardPlan, AwardRule, AwardRuleSet } from '@gramota/shared';
import { parseProtocol } from './protocol';
import { parseRecipientFile } from './recipient-file';
import type { ParsedProtocol } from './protocol';

/*
 * Вертикаль целиком: файл протокола → колонки → правила → план награждения.
 *
 * Тесты парсера проверяют разбор, тесты движка — раскладку. Между ними
 * остаётся стык, на котором всё и ломается: парсер называет колонку
 * `category`, а правило ищет `group`; парсер оставляет «=3», а движок
 * его не понимает. Здесь проверяется именно стык, на настоящих файлах.
 */

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/fixtures/protocols',
);

const WINNER = '11111111-1111-4111-8111-111111111111';
const PRIZE = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const COACH = '44444444-4444-4444-8444-444444444444';

const TITLES = {
  [WINNER]: 'Диплом победителя',
  [PRIZE]: 'Диплом призёра',
  [MEMBER]: 'Грамота участника',
  [COACH]: 'Благодарность тренеру',
};

let nextRule = 0;
function rule(partial: Partial<AwardRule>): AwardRule {
  nextRule++;
  return {
    id: `00000000-0000-4000-8000-${String(nextRule).padStart(12, '0')}`,
    position: nextRule,
    enabled: true,
    label: '',
    match: 'all',
    conditions: [],
    action: 'issue',
    outputs: [],
    ...partial,
  };
}

const out = (templateDocumentId: string, subjectColumn = '') => ({
  templateDocumentId,
  subjectColumn,
  dedupeScope: 'all' as const,
  label: '',
});

/** Типовое награждение федерации: снятым ничего, 1 место, 2–3, остальным грамота. */
function standardRules(): AwardRule[] {
  return [
    rule({
      position: 0,
      label: 'Снятые',
      action: 'skip',
      conditions: [{ field: 'status', op: 'statusIn', value: [...NO_AWARD_STATUSES] }],
    }),
    rule({
      position: 1,
      label: 'Победители',
      conditions: [{ field: 'place', op: 'placeEquals', value: 1, withinGroup: false }],
      outputs: [out(WINNER)],
    }),
    rule({
      position: 2,
      label: 'Призёры',
      conditions: [
        { field: 'place', op: 'placeBetween', value: { from: 2, to: 3 }, withinGroup: false },
      ],
      outputs: [out(PRIZE)],
    }),
    rule({ position: 3, label: 'Участники', conditions: [], outputs: [out(MEMBER)] }),
  ];
}

/** План по разобранному файлу: ровно то, что сделает сервер перед выпуском. */
function planFor(parsed: ParsedProtocol, rules: AwardRule[]): AwardPlan {
  const set: AwardRuleSet = {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'Награждение по протоколу',
    schemaVersion: 1,
    groupColumn: parsed.groupColumn,
    statusColumn: parsed.columns.some((c) => c.suggested === 'status') ? 'status' : '',
    rules,
  };
  return applyAwardRules({
    ruleSet: set,
    rows: parsed.rows.map((values, i) => ({
      id: `row-${i + 1}`,
      position: i,
      data: Object.fromEntries(parsed.columns.map((c, j) => [c.suggested, values[j] ?? ''])),
    })),
    templateTitles: TITLES,
  });
}

async function load(file: string): Promise<ParsedProtocol> {
  return parseProtocol(await readFile(path.join(FIXTURES, file)));
}

function counts(plan: AwardPlan): Record<string, number> {
  return Object.fromEntries(plan.summary.map((s) => [s.templateTitle, s.count]));
}

describe('протокол на несколько групп → награждение', () => {
  it('в каждой группе свой победитель и свои призёры', async () => {
    const parsed = await load('05-несколько-групп.xlsx');
    const plan = planFor(parsed, standardRules());

    // Три группы: 2 + 3 + 2 участника, в каждой первое место своё.
    expect(counts(plan)).toEqual({
      'Диплом победителя': 3,
      'Диплом призёра': 4,
    });
    expect(plan.totals.rows).toBe(7);
    expect(blockingIssues(plan)).toEqual([]);
  });

  it('группа из строки-заголовка работает так же, как колонка', async () => {
    const parsed = await load('06-заголовки-групп-строками.xlsx');
    const plan = planFor(parsed, standardRules());

    expect(parsed.groupColumn).toBe('category');
    expect(counts(plan)['Диплом победителя']).toBe(2);
    expect(plan.items.map((i) => i.group)).toEqual([
      'Юноши 16-17 лет, 100 м вольный стиль',
      'Юноши 16-17 лет, 100 м вольный стиль',
      'Юноши 16-17 лет, 100 м вольный стиль',
      'Девушки 16-17 лет, 100 м вольный стиль',
      'Девушки 16-17 лет, 100 м вольный стиль',
    ]);
  });
});

describe('снятые из протокола → без документов', () => {
  it('DSQ из своей графы и DSQ вместо места снимают одинаково', async () => {
    const parsed = await load('07-статусы.xlsx');
    const plan = planFor(parsed, standardRules());

    expect(plan.totals.excludedRows).toBe(4);
    const excluded = plan.issues.filter((i) => i.code === 'excluded-by-rule');
    expect(excluded.map((i) => i.subject)).toEqual([
      'Сидоров Алексей',
      'Никитин Денис',
      'Фёдоров Егор',
      // У Григорьева «DSQ» стоял в графе места — без переноса он получил бы
      // грамоту участника по правилу «иначе».
      'Григорьев Илья',
    ]);
    expect(blockingIssues(plan)).toEqual([]);
  });
});

describe('делёж мест из протокола → дипломы призёров', () => {
  it('«3-4» попадает в правило «место с 2 по 3»', async () => {
    const parsed = await load('08-делёж-дефис.xlsx');
    const plan = planFor(parsed, standardRules());
    expect(counts(plan)).toEqual({
      'Диплом победителя': 1,
      'Диплом призёра': 3,
      'Грамота участника': 1,
    });
  });

  it('«=1» и «=3» тоже, и «б/м» уходит в участники', async () => {
    const parsed = await load('09-делёж-равно.xlsx');
    const plan = planFor(parsed, standardRules());

    // Двое с «=1» — победители, двое с «=3» — призёры, «5» и «б/м» — участники.
    expect(counts(plan)).toEqual({
      'Диплом победителя': 2,
      'Диплом призёра': 2,
      'Грамота участника': 2,
    });
    // Ровно тот сценарий из ревью: без поддержки «=» призёры получили бы
    // грамоту участника при формально выданном предупреждении.
    expect(plan.issues.filter((i) => i.code === 'unparsable-place')).toEqual([]);
  });
});

describe('тренер из протокола → одна благодарность', () => {
  it('шесть призёров двух тренеров дают две благодарности', async () => {
    const parsed = await load('14-тренер.xlsx');
    const rules = [
      rule({
        position: 0,
        label: 'Призёры',
        conditions: [
          { field: 'place', op: 'placeBetween', value: { from: 1, to: 3 }, withinGroup: false },
        ],
        outputs: [out(PRIZE), out(COACH, 'coach')],
      }),
    ];
    const plan = planFor(parsed, rules);

    expect(counts(plan)).toEqual({ 'Диплом призёра': 6, 'Благодарность тренеру': 2 });
    expect(plan.totals.deduplicated).toBe(4);

    // Про каждую склейку сказано вслух: два разных тренера с одинаковым
    // написанием по ключу неразличимы.
    const merged = plan.issues.filter((i) => i.code === 'duplicate-subject');
    expect(merged.map((i) => i.subject).sort()).toEqual(['Козлова М. И.', 'Смирнов А. П.']);
  });

  it('внутри группы тот же тренер получает по благодарности на группу', async () => {
    const parsed = await load('14-тренер.xlsx');
    const rules = [
      rule({
        position: 0,
        label: 'Призёры',
        conditions: [
          { field: 'place', op: 'placeBetween', value: { from: 1, to: 3 }, withinGroup: false },
        ],
        outputs: [{ ...out(COACH, 'coach'), dedupeScope: 'group' as const }],
      }),
    ];
    const plan = planFor(parsed, rules);
    // Оба тренера работают в обеих группах — благодарностей четыре.
    expect(counts(plan)).toEqual({ 'Благодарность тренеру': 4 });
  });
});

describe('сквозная нумерация → пересчёт внутри группы', () => {
  it('без пересчёта победитель один, с пересчётом — по одному в группе', async () => {
    const parsed = await load('05-несколько-групп.xlsx');

    // Подменяем места на сквозные — так выгружает часть программ.
    const placeIndex = parsed.columns.findIndex((c) => c.suggested === 'place');
    parsed.rows.forEach((row, i) => (row[placeIndex] = String(i + 1)));

    const asWritten = planFor(parsed, [
      rule({
        position: 0,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1, withinGroup: false }],
        outputs: [out(WINNER)],
      }),
    ]);
    expect(asWritten.items).toHaveLength(1);

    const withinGroup = planFor(parsed, [
      rule({
        position: 0,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1, withinGroup: true }],
        outputs: [out(WINNER)],
      }),
    ]);
    expect(withinGroup.items.map((i) => i.group)).toEqual([
      'Юноши 14-15 лет',
      'Юноши 16-17 лет',
      'Девушки 16-17 лет',
    ]);
  });
});

describe('выбор прочтения файла', () => {
  it('протокол читается как протокол', async () => {
    const file = await readFile(path.join(FIXTURES, '05-несколько-групп.xlsx'));
    const parsed = await parseRecipientFile(file, '05-несколько-групп.xlsx');

    expect(parsed.protocol?.groupColumn).toBe('category');
    expect(parsed.protocol?.groups).toHaveLength(3);
  });

  it('обычный список участников курса протоколом не считается', async () => {
    // Ни мест, ни групп — протокольные догадки школе, которая грузит
    // список слушателей семинара, только помешают.
    const csv = Buffer.from('ФИО;Электронная почта\nИванов Иван;i@example.test', 'utf8');
    const parsed = await parseRecipientFile(csv, 'слушатели.csv');

    expect(parsed.protocol).toBeUndefined();
    expect(parsed.columns.map((c) => c.suggested)).toEqual(['name', 'email']);
  });
});
