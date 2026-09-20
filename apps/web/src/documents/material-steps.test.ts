import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MATERIAL_STEPS,
  legacyWorkspaceTab,
  materialPath,
  nextStep,
  stepOfView,
  stepsSentence,
  viewOfSegment,
} from './material-steps';

const ID = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';

/*
 * Порядок шагов — не оформление: он один на ленту, адреса и обучение.
 * Второго списка с другим порядком в исходниках быть не должно.
 */
describe('шаги документа', () => {
  it('идут в одном порядке: лист, получатели, проверка, письмо, выпуск', () => {
    expect(MATERIAL_STEPS.map((s) => s.label)).toEqual(['Лист', 'Получатели', 'Проверка', 'Письмо', 'Выпуск']);
    expect(stepsSentence()).toBe('Лист → Получатели → Проверка → Письмо → Выпуск');
  });

  it('живут под одним адресом документа', () => {
    expect(materialPath(ID)).toBe(`/documents/${ID}`);
    expect(materialPath(ID, 'sheet')).toBe(`/documents/${ID}`);
    expect(materialPath(ID, 'recipients')).toBe(`/documents/${ID}/recipients`);
    expect(materialPath(ID, 'issue')).toBe(`/documents/${ID}/issue`);
    expect(materialPath(ID, 'rules')).toBe(`/documents/${ID}/rules`);
  });

  it('«Дальше» ведёт по порядку и кончается на выпуске', () => {
    expect(nextStep('sheet')).toBe('recipients');
    expect(nextStep('letter')).toBe('issue');
    expect(nextStep('issue')).toBeNull();
  });

  it('правила награждения подсвечивают выпуск', () => {
    expect(stepOfView('rules')).toBe('issue');
    expect(stepOfView('check')).toBe('check');
  });

  it('незнакомый сегмент открывает получателей, а не пустоту', () => {
    expect(viewOfSegment(undefined)).toBe('sheet');
    expect(viewOfSegment('check')).toBe('check');
    expect(viewOfSegment('чтотоещё')).toBe('recipients');
  });

  it('переводит прежние вкладки рабочего места', () => {
    expect(legacyWorkspaceTab('table')).toBe('recipients');
    expect(legacyWorkspaceTab('mail')).toBe('letter');
    expect(legacyWorkspaceTab('verify')).toBe('issue');
    expect(legacyWorkspaceTab('rules')).toBe('rules');
    expect(legacyWorkspaceTab(null)).toBe('recipients');
  });

  it('второго порядка шагов в исходниках нет', () => {
    const src = readFileSync(fileURLToPath(new URL('../mailing/workspace-tabs.ts', import.meta.url)), 'utf8');
    expect(src).not.toContain('ISSUE_STEPS');
  });
});
