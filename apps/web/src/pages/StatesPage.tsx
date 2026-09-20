import { useEffect, useState, type ReactNode } from 'react';
import {
  Download,
  FileText,
  Mail,
  MoreHorizontal,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, Rows } from '../ui/Card';
import { Checkbox, Radio } from '../ui/Checkbox';
import { DateField } from '../ui/DateField';
import { Dialog } from '../ui/Dialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBar, ErrorState } from '../ui/ErrorState';
import { Field, Input, Textarea, Toggle } from '../ui/Field';
import { IconButton } from '../ui/IconButton';
import { Kbd } from '../ui/Kbd';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { NextAction } from '../ui/NextAction';
import { NumberField } from '../ui/NumberField';
import { OptionCard, OptionGroup } from '../ui/OptionCard';
import { Outcome } from '../ui/Outcome';
import { PageHeader } from '../ui/PageHeader';
import { ProgressBar } from '../ui/Progress';
import { Select } from '../ui/Select';
import { Sheet } from '../ui/Sheet';
import { SkeletonCards, SkeletonForm, SkeletonRows, SkeletonTiles } from '../ui/Skeleton';
import { Stat } from '../ui/Stat';
import { Stepper } from '../ui/Stepper';
import { TBody, THead, Table, TableSelectionBar, Td, Th, Tr } from '../ui/Table';
import { Segmented, UnderlineTabs } from '../ui/Tabs';
import { toast } from '../ui/Toast';

/**
 * Витрина кита: каждый примитив во всех состояниях.
 *
 * Только в разработке (см. App.tsx). Здесь видно, как выглядит кнопка
 * в загрузке, таблица с отмеченными строками и пустое место, без того,
 * чтобы ронять сервер или ждать выпуск на триста строк. Тёмную тему
 * смотреть переключателем в настройках.
 */
export function StatesPage() {
  const [done, setDone] = useState(0);
  const total = 300;
  useEffect(() => {
    const t = setInterval(() => setDone((d) => (d >= total ? 0 : d + 7)), 900);
    return () => clearInterval(t);
  }, []);

  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [option, setOption] = useState('files');
  const [checked, setChecked] = useState(true);
  const [toggle, setToggle] = useState(false);
  const [select, setSelect] = useState('a4');
  const [num, setNum] = useState('12');
  const [date, setDate] = useState('2026-09-20');
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [rows, setRows] = useState<Set<number>>(new Set([2]));

  return (
    <main className="mx-auto max-w-5xl space-y-12 px-6 py-8">
      <PageHeader title="Кит интерфейса" count={24} about="Каждый примитив во всех состояниях" />

      <Block title="Кнопки">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Plus size={16} />}>
            Создать документ
          </Button>
          <Button>Вторичная</Button>
          <Button variant="ghost">Тихая</Button>
          <Button variant="danger" icon={<Trash2 size={16} />}>
            Удалить
          </Button>
          <Button variant="link">Ссылкой</Button>
          <Button variant="primary" loading>
            Сохраняем
          </Button>
          <Button disabled>Недоступна</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="primary">
            Маленькая
          </Button>
          <Button size="md">Обычная</Button>
          <Button size="lg" variant="primary">
            Крупная
          </Button>
          <IconButton label="Ещё">
            <MoreHorizontal size={16} />
          </IconButton>
          <IconButton label="Скачать" size="sm">
            <Download size={16} />
          </IconButton>
          <Button iconOnly label="Включено" active icon={<Mail size={16} />} />
          <Button variant="primary" to="/documents">
            Ссылка-кнопка
          </Button>
        </div>
      </Block>

      <Block title="Метки и аватары">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>нейтральная</Badge>
          <Badge tone="info" dot>
            идёт
          </Badge>
          <Badge tone="ok">доставлено</Badge>
          <Badge tone="warn">заменён</Badge>
          <Badge tone="danger">отозван</Badge>
          <Badge tone="accent" size="sm">
            новое
          </Badge>
          <Avatar name="Тестовая школа" size="sm" />
          <Avatar name="Анна" />
          <Avatar email="test@vruchay.local" size="lg" />
          <span className="text-sm text-muted">
            Сохранить <Kbd>Ctrl</Kbd> <Kbd>S</Kbd>
          </span>
        </div>
      </Block>

      <Block title="Плитки и карточки">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Осталось на пробе" value={50} unit="из 50" hint="Бесплатная проба" />
          <Stat label="Выпущено в сентябре" value={0} hint="как в августе" to="/registry" />
          <Stat label="Письма доставлены" value="—" hint="Писем пока не было" tone="warn" />
          <Stat label="Проверки по QR" value={12} unit="проверок" loading />
        </div>
        <Card title="Карточка" count={3} about="Подводка одной строкой" to="/registry" linkLabel="В реестр">
          <Rows>
            <li className="flex items-center justify-between px-4 py-3 text-sm">
              <span>Строка первая</span>
              <Badge tone="ok">готово</Badge>
            </li>
            <li className="flex items-center justify-between px-4 py-3 text-sm">
              <span>Строка вторая</span>
              <Badge>ждёт</Badge>
            </li>
          </Rows>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card interactive padding="sm">
            <CardHeader title="Нажимаемая" action={<Badge tone="info">чип</Badge>} className="mb-2" />
            <p className="text-sm text-muted">Рамка темнеет под указателем.</p>
          </Card>
          <Card tone="danger" padding="sm" title="Опасная зона" action={<Button variant="danger" size="sm">Удалить</Button>}>
            <p className="text-sm text-muted">Единственная красная рамка на странице.</p>
          </Card>
        </div>
      </Block>

      <Block title="Шаги и вкладки">
        <Stepper
          steps={[
            { id: 'sheet', label: 'Лист', to: '#', state: 'done' },
            { id: 'recipients', label: 'Получатели', to: '#', state: 'current', hint: '12 строк' },
            { id: 'check', label: 'Проверка', to: '#', state: 'warn', hint: '2 замечания' },
            { id: 'letter', label: 'Письмо', to: '#', state: 'todo' },
            { id: 'issue', label: 'Выпуск', to: '#', state: 'todo' },
          ]}
        />
        <div className="flex flex-wrap items-start gap-6">
          <Segmented
            label="Разделы реестра"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'a', label: 'Выданные', count: 128 },
              { id: 'b', label: 'Аналитика' },
              { id: 'c', label: 'Ещё' },
            ]}
          />
          <UnderlineTabs
            label="Панель"
            value={tab}
            onChange={setTab}
            className="w-72"
            items={[
              { id: 'a', label: 'Свойства' },
              { id: 'b', label: 'Данные', count: 6 },
              { id: 'c', label: 'Слои' },
            ]}
          />
        </div>
      </Block>

      <Block title="Поля">
        <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label="Электронная почта" help="Сюда придёт ссылка">
            <Input type="email" placeholder="ivanova@school.ru" />
          </Field>
          <Field label="Название" error="Заполните название" required>
            <Input defaultValue="" />
          </Field>
          <Field label="Формат">
            <Select
              value={select}
              onChange={setSelect}
              options={[
                { value: 'a4', label: 'A4', hint: '210×297 мм' },
                { value: 'a5', label: 'A5', hint: '148×210 мм' },
                { value: 'custom', label: 'Свой', group: 'Другое' },
              ]}
            />
          </Field>
          <Field label="Дата мероприятия">
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Отступ, мм">
            <NumberField value={num} onChange={setNum} min={0} max={50} />
          </Field>
          <Field label="Поле в строке" layout="inline">
            <Input compact placeholder="компактное" />
          </Field>
          <Field label="Письмо" className="sm:col-span-2">
            <Textarea placeholder="Здравствуйте, %name!" />
          </Field>
        </div>
        <div className="flex flex-wrap items-start gap-8">
          <Checkbox checked={checked} onChange={setChecked} label="Отправить письма" hint="Всем, у кого есть адрес" />
          <div className="space-y-2">
            <Radio name="r" checked={option === 'files'} onChange={() => setOption('files')} label="Только файлы" />
            <Radio name="r" checked={option === 'send'} onChange={() => setOption('send')} label="Файлы и письма" />
          </div>
          <Toggle checked={toggle} onChange={setToggle} label="Двухфакторный вход" hint="Код из приложения при каждом входе" />
        </div>
        <OptionGroup label="Что сделать после создания файлов" columns={3}>
          <OptionCard
            icon={Download}
            title="Только создать файлы"
            description="Скачаете и раздадите сами"
            selected={option === 'files'}
            onSelect={() => setOption('files')}
          />
          <OptionCard
            icon={Send}
            title="Создать и разослать"
            description="Каждому участнику — письмо с документом"
            selected={option === 'send'}
            onSelect={() => setOption('send')}
          />
          <OptionCard icon={FileText} title="Перетащите бланк" description="PDF, PNG или JPG" dropzone onSelect={() => setOption('drop')} selected={option === 'drop'} />
        </OptionGroup>
      </Block>

      <Block title="Таблица">
        <Table caption="Выданные документы">
          <THead>
            <Tr>
              <Th width={40}>
                <Checkbox checked={rows.size === 3} onChange={(v) => setRows(v ? new Set([1, 2, 3]) : new Set())} aria-label="Отметить все" />
              </Th>
              <Th sortable sort="asc" onSort={() => undefined}>
                Получатель
              </Th>
              <Th>Документ</Th>
              <Th align="right" sortable onSort={() => undefined}>
                Выдан
              </Th>
              <Th>Состояние</Th>
            </Tr>
          </THead>
          <TBody>
            {[1, 2, 3].map((i) => (
              <Tr key={i} selected={rows.has(i)}>
                <Td>
                  <Checkbox
                    checked={rows.has(i)}
                    onChange={(v) =>
                      setRows((s) => {
                        const n = new Set(s);
                        if (v) n.add(i);
                        else n.delete(i);
                        return n;
                      })
                    }
                    aria-label={`Строка ${i}`}
                  />
                </Td>
                <Td>Островская Анна</Td>
                <Td className="text-muted">Сертификат участника</Td>
                <Td align="right" numeric>
                  17.06.2026
                </Td>
                <Td>
                  <Badge tone={i === 3 ? 'danger' : 'ok'}>{i === 3 ? 'отозван' : 'действителен'}</Badge>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        <TableSelectionBar count={rows.size} onClear={() => setRows(new Set())}>
          <Button size="sm">Переслать</Button>
          <Button size="sm" variant="danger">
            Отозвать
          </Button>
        </TableSelectionBar>
      </Block>

      <Block title="Слои">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setDialog(true)}>Открыть окно</Button>
          <Button onClick={() => setSheet(true)}>Открыть шторку</Button>
          <Menu
            trigger={({ toggle: t }) => (
              <Button onClick={t} icon={<MoreHorizontal size={16} />}>
                Меню
              </Button>
            )}
          >
            <MenuItem icon={<Download size={16} />} shortcut="⌘S">
              Скачать
            </MenuItem>
            <MenuItem icon={<Mail size={16} />} checked>
              Письма включены
            </MenuItem>
            <MenuDivider />
            <MenuItem icon={<Trash2 size={16} />} danger>
              Удалить
            </MenuItem>
          </Menu>
          <Button onClick={() => toast({ title: 'Сохранено', tone: 'ok' })}>Тост</Button>
          <Button
            onClick={() =>
              toast({
                title: '13 писем не дошли',
                description: 'Адреса не существуют',
                tone: 'danger',
                action: { label: 'Показать', onClick: () => undefined },
              })
            }
          >
            Тост с ошибкой
          </Button>
        </div>
        {dialog && (
          <Dialog
            title="Удалить документ?"
            description="Документ уйдёт в архив на 7 дней"
            onClose={() => setDialog(false)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(false)}>
                  Отмена
                </Button>
                <Button variant="danger" onClick={() => setDialog(false)}>
                  Удалить
                </Button>
              </>
            }
          >
            <Field label="Причина">
              <Input placeholder="Необязательно" />
            </Field>
          </Dialog>
        )}
        <Sheet open={sheet} onClose={() => setSheet(false)} title="История документа">
          <p className="text-sm text-muted">Здесь была бы история.</p>
        </Sheet>
      </Block>

      <Block title="Пустое и следующее действие">
        <Card padding="none">
          <NextAction
            icon={Users}
            title="Загрузите список получателей"
            text="Хватит колонок «Фамилия», «Имя» и «Почта»"
            primary={{ label: 'Загрузить файл', icon: <Plus size={16} /> }}
            secondary={{ label: 'Вставить из буфера' }}
          />
        </Card>
        <Card padding="none">
          <NextAction compact icon={FileText} title="Ничего не нашлось" primary={{ label: 'Сбросить отбор' }} />
        </Card>
        <Card padding="none">
          <EmptyState icon={FileText} title="Прежнее пустое состояние">
            Остаётся до полной замены
          </EmptyState>
        </Card>
      </Block>

      <Block title="Загрузка">
        <SkeletonTiles />
        <SkeletonCards count={3} />
        <Card padding="none">
          <SkeletonRows rows={4} />
        </Card>
        <Card className="max-w-md">
          <SkeletonForm fields={2} />
        </Card>
      </Block>

      <Block title="Долгая операция и итог">
        <Card>
          <ProgressBar done={done} failed={Math.floor(done / 25)} total={total} running={done < total} />
        </Card>
        <Card>
          <Outcome
            done={287}
            failed={13}
            doneLabel="выпущено"
            action={
              <>
                <Button variant="primary">Показать 13 строк</Button>
                <Button>Скачать 287 PDF</Button>
              </>
            }
          />
        </Card>
      </Block>

      <Block title="Ошибка">
        <Card padding="none">
          <ErrorState title="Документы не открылись" onRetry={() => undefined} />
        </Card>
        <ErrorBar onRetry={() => undefined}>
          Файл не читается: он в кодировке Windows‑1251, так сохраняет 1С. Преобразуем автоматически.
        </ErrorBar>
      </Block>
    </main>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}
