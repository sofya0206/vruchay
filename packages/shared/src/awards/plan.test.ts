import { describe, expect, it } from 'vitest';
import { applyAwardRules, blockingIssues } from './plan';
import type { AwardPlanRow } from './plan';
import type { AwardRule, AwardRuleSet } from './rules';
import { NO_AWARD_STATUSES } from './status';

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

let nextId = 0;
function rule(partial: Partial<AwardRule>): AwardRule {
  nextId++;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
    position: nextId,
    enabled: true,
    label: '',
    match: 'all',
    conditions: [],
    action: 'issue',
    outputs: [],
    ...partial,
  };
}

function ruleSet(rules: AwardRule[], extra: Partial<AwardRuleSet> = {}): AwardRuleSet {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'Набор',
    schemaVersion: 1,
    groupColumn: 'category',
    statusColumn: 'status',
    rules,
    ...extra,
  };
}

function rows(...data: Record<string, string>[]): AwardPlanRow[] {
  return data.map((d, i) => ({ id: `row-${i + 1}`, position: i, data: d }));
}

/** Стандартная тройка правил: снятые, победители, призёры, остальные. */
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
      conditions: [{ field: 'place', op: 'placeEquals', value: 1 }],
      outputs: [{ templateDocumentId: WINNER, subjectColumn: '', dedupeScope: 'all', label: '' }],
    }),
    rule({
      position: 2,
      label: 'Призёры',
      conditions: [{ field: 'place', op: 'placeBetween', value: { from: 2, to: 3 } }],
      outputs: [{ templateDocumentId: PRIZE, subjectColumn: '', dedupeScope: 'all', label: '' }],
    }),
    rule({
      position: 3,
      label: 'Участники',
      conditions: [],
      outputs: [{ templateDocumentId: MEMBER, subjectColumn: '', dedupeScope: 'all', label: '' }],
    }),
  ];
}

describe('applyAwardRules', () => {
  it('раскладывает участников по местам', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows(
        { name: 'Иванов Иван', place: '1', category: 'Юноши', status: '' },
        { name: 'Петров Пётр', place: '2', category: 'Юноши', status: '' },
        { name: 'Сидоров Пётр', place: '7', category: 'Юноши', status: '' },
      ),
      templateTitles: TITLES,
    });

    expect(plan.items.map((i) => i.templateTitle)).toEqual([
      'Диплом победителя',
      'Диплом призёра',
      'Грамота участника',
    ]);
    expect(plan.totals.documents).toBe(3);
    expect(blockingIssues(plan)).toEqual([]);
  });

  it('выигрывает первое совпавшее правило, а не самое подходящее', () => {
    // «Участники» стоят выше призёров — значит призёр получит грамоту участника.
    const shuffled = [
      rule({ position: 0, label: 'Участники', conditions: [], outputs: [
        { templateDocumentId: MEMBER, subjectColumn: '', dedupeScope: 'all', label: '' },
      ] }),
      rule({
        position: 1,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1 }],
        outputs: [{ templateDocumentId: WINNER, subjectColumn: '', dedupeScope: 'all', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(shuffled),
      rows: rows({ name: 'Иванов', place: '1', category: 'Юноши' }),
      templateTitles: TITLES,
    });
    expect(plan.items[0].templateTitle).toBe('Грамота участника');
  });

  it('место из ячейки берётся как написано, без пересчёта', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows(
        { name: 'Иванов', place: '1', category: 'Юноши' },
        { name: 'Кузнецова', place: '1', category: 'Девушки' },
      ),
      templateTitles: TITLES,
    });
    // В обычном протоколе места уже расставлены по группам: два первых
    // места — это два диплома, и пересчитывать тут нечего.
    expect(plan.summary.find((s) => s.templateDocumentId === WINNER)?.count).toBe(2);
    expect(plan.items.map((i) => i.group)).toEqual(['Юноши', 'Девушки']);
  });

  /*
   * Сквозная нумерация: места в файле идут 1..4 подряд, а групп две.
   * Без пересчёта победитель нашёлся бы один на весь протокол — вторая
   * группа осталась бы без диплома победителя.
   */
  const CONTINUOUS = [
    { name: 'Иванов', place: '1', category: 'Юноши' },
    { name: 'Петров', place: '2', category: 'Юноши' },
    { name: 'Кузнецова', place: '3', category: 'Девушки' },
    { name: 'Соколова', place: '4', category: 'Девушки' },
  ];

  function winnersWithinGroup(): AwardRule[] {
    return [
      rule({
        position: 0,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1, withinGroup: true }],
        outputs: [{ templateDocumentId: WINNER, subjectColumn: '', dedupeScope: 'all', label: '' }],
      }),
    ];
  }

  it('с признаком «внутри группы» место считается среди строк своей группы', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(winnersWithinGroup()),
      rows: rows(...CONTINUOUS),
      templateTitles: TITLES,
    });

    expect(plan.items.map((i) => i.subject)).toEqual(['Иванов', 'Кузнецова']);
    expect(plan.items.map((i) => i.group)).toEqual(['Юноши', 'Девушки']);
  });

  it('без колонки группы тот же набор даёт одного победителя на весь файл', () => {
    // Этот тест — страховка предыдущего: если убрать groupColumn, результат
    // обязан измениться. Иначе «внутри группы» ничего не значит.
    const plan = applyAwardRules({
      ruleSet: ruleSet(winnersWithinGroup(), { groupColumn: '' }),
      rows: rows(...CONTINUOUS),
      templateTitles: TITLES,
    });
    expect(plan.items.map((i) => i.subject)).toEqual(['Иванов']);
  });

  it('внутри группы делёж занимает два места, и следующий получает третье', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Призёры',
        conditions: [
          { field: 'place', op: 'placeBetween', value: { from: 1, to: 2 }, withinGroup: true },
        ],
        outputs: [{ templateDocumentId: PRIZE, subjectColumn: '', dedupeScope: 'all', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows(
        { name: 'Первый', place: '10', category: 'Юноши' },
        { name: 'Второй', place: '11', category: 'Юноши' },
        { name: 'Третий', place: '11', category: 'Юноши' },
        { name: 'Четвёртый', place: '12', category: 'Юноши' },
      ),
      templateTitles: TITLES,
    });

    // 10 → первое, оба 11 → «2-3», 12 → четвёртое. В интервал 1-2 попадают
    // трое: победитель и оба поделивших второе.
    expect(plan.items.map((i) => i.subject)).toEqual(['Первый', 'Второй', 'Третий']);
  });

  it('снятые не занимают места при пересчёте внутри группы', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(winnersWithinGroup()),
      rows: rows(
        { name: 'Дисквалифицированный', place: '1', category: 'Юноши', status: 'DSQ' },
        { name: 'Настоящий победитель', place: '2', category: 'Юноши', status: '' },
      ),
      templateTitles: TITLES,
    });
    expect(plan.items.map((i) => i.subject)).toEqual(['Настоящий победитель']);
  });

  it('делёжка мест попадает в правило призёров', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows(
        { name: 'Первый', place: '3-4', category: 'Юноши' },
        { name: 'Второй', place: '3-4', category: 'Юноши' },
      ),
      templateTitles: TITLES,
    });
    expect(plan.items.map((i) => i.templateTitle)).toEqual(['Диплом призёра', 'Диплом призёра']);
  });

  it('снятым документ не выдаётся, и это видно в отчёте', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows(
        { name: 'Иванов', place: '1', category: 'Юноши', status: 'DSQ' },
        { name: 'Петров', place: '', category: 'Юноши', status: 'снят' },
        { name: 'Сидоров', place: '2', category: 'Юноши', status: '' },
      ),
      templateTitles: TITLES,
    });

    expect(plan.totals.documents).toBe(1);
    expect(plan.totals.excludedRows).toBe(2);
    const excluded = plan.issues.filter((i) => i.code === 'excluded-by-rule');
    expect(excluded.map((i) => i.subject)).toEqual(['Иванов', 'Петров']);
    // Снятие — решение, а не пробел: выпуску оно не мешает.
    expect(excluded.every((i) => i.severity === 'warning')).toBe(true);
    expect(blockingIssues(plan)).toEqual([]);
  });

  it('одно правило выдаёт и участнику, и тренеру', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1 }],
        outputs: [
          { templateDocumentId: WINNER, subjectColumn: '', dedupeScope: 'all', label: '' },
          {
            templateDocumentId: COACH,
            subjectColumn: 'coach',
            dedupeScope: 'all',
            label: 'Благодарность тренеру',
          },
        ],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows({ name: 'Иванов', place: '1', category: 'Юноши', coach: 'Смирнов А. П.' }),
      templateTitles: TITLES,
    });

    expect(plan.totals.documents).toBe(2);
    expect(plan.items.map((i) => i.subject)).toEqual(['Иванов', 'Смирнов А. П.']);
  });

  it('тренеру с пятью призёрами благодарность одна, но строки не теряются', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Призёры',
        conditions: [{ field: 'place', op: 'placeBetween', value: { from: 1, to: 3 } }],
        outputs: [
          { templateDocumentId: PRIZE, subjectColumn: '', dedupeScope: 'all', label: '' },
          { templateDocumentId: COACH, subjectColumn: 'coach', dedupeScope: 'all', label: '' },
        ],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows(
        { name: 'Первый', place: '1', category: 'Юноши', coach: 'Смирнов А. П.' },
        { name: 'Второй', place: '2', category: 'Юноши', coach: 'смирнов а. п.' },
        { name: 'Третий', place: '3', category: 'Девушки', coach: 'Смирнов  А. П.' },
      ),
      templateTitles: TITLES,
    });

    const coachDocs = plan.items.filter((i) => i.templateDocumentId === COACH);
    expect(coachDocs).toHaveLength(1);
    expect(coachDocs[0].mergedRowIds).toEqual(['row-2', 'row-3']);
    expect(plan.totals.deduplicated).toBe(2);
    expect(plan.totals.documents).toBe(4);

    // Склейка не проходит молча: два разных тренера, записанных одинаково,
    // по ключу неразличимы, и второй остался бы без документа незаметно.
    const merged = plan.issues.filter((i) => i.code === 'duplicate-subject');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ severity: 'warning', subject: 'Смирнов А. П.' });
    expect(merged[0].message).toMatch(/строках 1, 2, 3/);
  });

  it('без склейки замечания о повторе не возникает', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Призёры',
        conditions: [{ field: 'place', op: 'placeBetween', value: { from: 1, to: 3 } }],
        outputs: [
          { templateDocumentId: COACH, subjectColumn: 'coach', dedupeScope: 'all', label: '' },
        ],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows(
        { name: 'Первый', place: '1', category: 'Юноши', coach: 'Смирнов А. П.' },
        { name: 'Второй', place: '2', category: 'Юноши', coach: 'Козлова М. И.' },
      ),
      templateTitles: TITLES,
    });
    expect(plan.issues.filter((i) => i.code === 'duplicate-subject')).toHaveLength(0);
  });

  it('внутри группы тренер получает по благодарности на группу', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Призёры',
        conditions: [{ field: 'place', op: 'placeBetween', value: { from: 1, to: 3 } }],
        outputs: [{ templateDocumentId: COACH, subjectColumn: 'coach', dedupeScope: 'group', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows(
        { name: 'Первый', place: '1', category: 'Юноши', coach: 'Смирнов' },
        { name: 'Второй', place: '2', category: 'Юноши', coach: 'Смирнов' },
        { name: 'Третий', place: '1', category: 'Девушки', coach: 'Смирнов' },
      ),
      templateTitles: TITLES,
    });
    expect(plan.items).toHaveLength(2);
    expect(plan.items.map((i) => i.group)).toEqual(['Юноши', 'Девушки']);
  });

  it('однофамильцев-участников не склеивает', () => {
    const rules = [
      rule({
        position: 0,
        conditions: [],
        outputs: [{ templateDocumentId: MEMBER, subjectColumn: '', dedupeScope: 'all', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows(
        { name: 'Иванов Иван Иванович', category: 'Юноши' },
        { name: 'Иванов Иван Иванович', category: 'Юноши' },
      ),
      templateTitles: TITLES,
    });
    expect(plan.items).toHaveLength(2);
  });

  it('строка без правила остаётся в отчёте и мешает выпуску', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1 }],
        outputs: [{ templateDocumentId: WINNER, subjectColumn: '', dedupeScope: 'all', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows(
        { name: 'Иванов', place: '1', category: 'Юноши' },
        { name: 'Петров', place: '9', category: 'Юноши' },
      ),
      templateTitles: TITLES,
    });

    expect(plan.totals.unmatchedRows).toBe(1);
    const issue = plan.issues.find((i) => i.code === 'no-rule');
    expect(issue).toMatchObject({
      severity: 'error',
      rowId: 'row-2',
      rowNumber: 2,
      group: 'Юноши',
      subject: 'Петров',
    });
    expect(blockingIssues(plan)).toHaveLength(1);
  });

  it('сообщает об удалённом шаблоне и не планирует по нему документ', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Победители',
        conditions: [],
        outputs: [{ templateDocumentId: WINNER, subjectColumn: '', dedupeScope: 'all', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows({ name: 'Иванов', place: '1', category: 'Юноши' }),
      templateTitles: {},
    });
    expect(plan.items).toHaveLength(0);
    expect(plan.issues.map((i) => i.code)).toContain('no-template');
    expect(blockingIssues(plan)).toHaveLength(1);
  });

  it('сообщает о пустой колонке получателя вместо документа в никуда', () => {
    const rules = [
      rule({
        position: 0,
        conditions: [],
        outputs: [{ templateDocumentId: COACH, subjectColumn: 'coach', dedupeScope: 'all', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows({ name: 'Иванов', category: 'Юноши', coach: '  ' }),
      templateTitles: TITLES,
    });
    expect(plan.items).toHaveLength(0);
    expect(plan.issues[0]).toMatchObject({ code: 'empty-subject', severity: 'error' });
  });

  it('предупреждает о нечитаемом месте, не срывая выпуск', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows({ name: 'Иванов', place: 'см. приложение', category: 'Юноши', status: '' }),
      templateTitles: TITLES,
    });

    expect(plan.issues.map((i) => i.code)).toContain('unparsable-place');
    expect(blockingIssues(plan)).toEqual([]);
    // Строка всё равно награждена — по правилу «иначе».
    expect(plan.items[0].templateTitle).toBe('Грамота участника');
  });

  it('о пустой группе молчит, пока группа ни на что не влияет', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows({ name: 'Иванов', place: '1', category: '', status: '' }),
      templateTitles: TITLES,
    });
    // Ни одно правило не считает место внутри группы и не дедуплицирует
    // по группе — предупреждать не о чем, а лишнее замечание учит
    // пролистывать отчёт не читая.
    expect(plan.issues.map((i) => i.code)).not.toContain('missing-group');
  });

  it('о пустой группе предупреждает, когда от неё зависит место', () => {
    const rules = [
      rule({
        position: 0,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1, withinGroup: true }],
        outputs: [{ templateDocumentId: WINNER, subjectColumn: '', dedupeScope: 'all', label: '' }],
      }),
    ];
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows({ name: 'Иванов', place: '1', category: '' }),
      templateTitles: TITLES,
    });
    expect(plan.issues.map((i) => i.code)).toContain('missing-group');
  });

  it('«б/м» не считается нечитаемым местом', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows({ name: 'Иванов', place: 'б/м', category: 'Юноши' }),
      templateTitles: TITLES,
    });
    expect(plan.issues.map((i) => i.code)).not.toContain('unparsable-place');
    expect(plan.items[0].templateTitle).toBe('Грамота участника');
  });

  it('о нечитаемом месте сообщает один раз на строку, а не на каждое правило', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows({ name: 'Иванов', place: 'участвовал', category: 'Юноши' }),
      templateTitles: TITLES,
    });
    expect(plan.issues.filter((i) => i.code === 'unparsable-place')).toHaveLength(1);
  });

  it('нераспознанный статус останавливает выдачу, а не пропускает строку', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows(
        { name: 'Иванов', place: '1', category: 'Юноши', status: 'см. протокол' },
        { name: 'Петров', place: '2', category: 'Юноши', status: '' },
      ),
      templateTitles: TITLES,
    });

    // Раньше строка проваливалась в правило «иначе» и снятый получал грамоту.
    expect(plan.items.map((i) => i.subject)).toEqual(['Петров']);
    expect(plan.totals.blockedRows).toBe(1);
    const issue = plan.issues.find((i) => i.code === 'unknown-status');
    expect(issue).toMatchObject({ severity: 'error', subject: 'Иванов' });
    expect(blockingIssues(plan)).toHaveLength(1);
  });

  it('выключенные правила пропускает', () => {
    const rules = standardRules();
    rules[0].enabled = false;
    const plan = applyAwardRules({
      ruleSet: ruleSet(rules),
      rows: rows({ name: 'Иванов', place: '1', category: 'Юноши', status: 'DSQ' }),
      templateTitles: TITLES,
    });
    expect(plan.totals.excludedRows).toBe(0);
    expect(plan.items[0].templateTitle).toBe('Диплом победителя');
  });

  it('превью раскладки считает документы по шаблонам', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows(
        { name: 'А', place: '1', category: 'Юноши' },
        { name: 'Б', place: '2', category: 'Юноши' },
        { name: 'В', place: '5', category: 'Юноши' },
        { name: 'Г', place: '6', category: 'Юноши' },
        { name: 'Д', place: '7', category: 'Юноши' },
      ),
      templateTitles: TITLES,
    });

    expect(plan.summary).toEqual([
      {
        templateDocumentId: MEMBER,
        templateTitle: 'Грамота участника',
        ruleLabels: ['Участники'],
        count: 3,
      },
      {
        templateDocumentId: WINNER,
        templateTitle: 'Диплом победителя',
        ruleLabels: ['Победители'],
        count: 1,
      },
      {
        templateDocumentId: PRIZE,
        templateTitle: 'Диплом призёра',
        ruleLabels: ['Призёры'],
        count: 1,
      },
    ]);
  });

  it('план сериализуем целиком и хранит подписи на момент расчёта', () => {
    const plan = applyAwardRules({
      ruleSet: ruleSet(standardRules()),
      rows: rows({ name: 'Иванов', place: '1', category: 'Юноши' }),
      templateTitles: TITLES,
    });
    const restored = JSON.parse(JSON.stringify(plan));
    expect(restored).toEqual(plan);
    expect(restored.items[0]).toMatchObject({
      rowId: 'row-1',
      templateDocumentId: WINNER,
      ruleLabel: 'Победители',
    });
  });
});
