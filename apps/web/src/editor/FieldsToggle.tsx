import { Variable } from 'lucide-react';
import { Button } from '../ui/Button';
import { toggleFieldsPanel, useFieldsPanelOpen } from './fields-sidebar-store';

/**
 * Кнопка панели данных — на «Получателях» и в «Письме», где у страницы
 * нет своей правой панели. На листе та же панель — вкладка «Данные»
 * рядом со свойствами и слоями, и отдельной кнопки там нет.
 *
 * «Данные», а не «Поля»: поля есть и у листа (отступы печати), а здесь —
 * то, что подставится из таблицы получателей.
 */
export function FieldsToggle() {
  const open = useFieldsPanelOpen();
  return (
    <Button
      size="sm"
      variant="secondary"
      active={open}
      icon={<Variable size={16} strokeWidth={1.75} />}
      onClick={toggleFieldsPanel}
    >
      Данные
    </Button>
  );
}
