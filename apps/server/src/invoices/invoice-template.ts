import { escapeHtml } from '../mail/mail-template';
import { amountInWords } from './amount-in-words';

/**
 * Разметка счёта на оплату.
 *
 * Счёт — не бланк строгой отчётности, жёсткой формы у него нет. Но есть
 * набор, без которого бухгалтерия его не примет: реквизиты сторон, номер
 * и дата, наименование услуги, сумма цифрами и прописью, отметка про НДС.
 *
 * Отдельно важен блок с назначением платежа. По нему банк потом сопоставит
 * поступление с этим счётом: без номера в назначении платёж придётся
 * разбирать руками, а мы ровно от этого и уходим.
 */

export interface SellerRequisites {
  name: string;
  inn: string;
  ogrnip: string;
  address: string;
  account: string;
  bank: string;
  bik: string;
  corrAccount: string;
}

export interface InvoiceData {
  number: number;
  year: number;
  date: Date;
  buyerName: string;
  buyerInn: string;
  description: string;
  amountKopecks: number;
}

const money = (kopecks: number) =>
  (kopecks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderInvoiceHtml(data: InvoiceData, seller: SellerRequisites): string {
  const e = escapeHtml;
  const date = data.date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const purpose = `Оплата по счёту № ${data.number} от ${data.date.toLocaleDateString('ru-RU')}. Без НДС.`;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  @page { size: A4; }
  /* Цвета — из UI-кита кабинета числами. Фона у страницы нет: счёт
     печатают, а линии таблиц тёмные, чтобы не пропали на ч/б принтере. */
  body { font: 11pt/1.45 "PT Sans", "Helvetica Neue", Arial, sans-serif; color: #091135; }
  h1 { font-size: 17pt; margin: 0 0 4mm; }
  table { width: 100%; border-collapse: collapse; }
  .bank td { border: 1px solid #091135; padding: 2mm 3mm; vertical-align: top; font-size: 10pt; }
  .bank .label { color: #36394a; font-size: 8.5pt; display: block; }
  .items th, .items td { border: 1px solid #091135; padding: 2mm 3mm; font-size: 10pt; }
  .items th { background: #f5f3ff; font-weight: 600; text-align: left; }
  .num { text-align: right; white-space: nowrap; }
  .total { margin-top: 4mm; text-align: right; font-size: 11pt; }
  .total strong { font-size: 13pt; }
  .words { margin-top: 3mm; }
  .purpose { margin-top: 6mm; border: 1px solid #127ee3; padding: 3mm; background: #eaf3fe; font-size: 10pt; }
  .sign { margin-top: 14mm; }
  .sign-line { display: inline-block; width: 60mm; border-bottom: 1px solid #091135; }
  .muted { color: #36394a; }
</style></head>
<body>

<table class="bank">
  <tr>
    <td style="width:55%"><span class="label">Банк получателя</span>${e(seller.bank)}</td>
    <td style="width:15%"><span class="label">БИК</span>${e(seller.bik)}</td>
    <td><span class="label">Сч. №</span>${e(seller.corrAccount)}</td>
  </tr>
  <tr>
    <td><span class="label">Получатель</span>${e(seller.name)}<br>
      <span class="muted">ИНН ${e(seller.inn)} · ОГРНИП ${e(seller.ogrnip)}</span></td>
    <td colspan="2"><span class="label">Сч. №</span>${e(seller.account)}</td>
  </tr>
</table>

<h1 style="margin-top:8mm">Счёт на оплату № ${data.number} от ${e(date)}</h1>

<p style="margin:0 0 2mm"><strong>Исполнитель:</strong> ${e(seller.name)}, ИНН ${e(seller.inn)},
ОГРНИП ${e(seller.ogrnip)}, ${e(seller.address)}</p>
<p style="margin:0 0 6mm"><strong>Заказчик:</strong> ${e(data.buyerName)}, ИНН ${e(data.buyerInn)}</p>

<table class="items">
  <tr>
    <th style="width:8mm">№</th>
    <th>Наименование услуги</th>
    <th style="width:18mm">Кол-во</th>
    <th style="width:26mm">Цена, ₽</th>
    <th style="width:30mm">Сумма, ₽</th>
  </tr>
  <tr>
    <td>1</td>
    <td>${e(data.description)}</td>
    <td class="num">1</td>
    <td class="num">${money(data.amountKopecks)}</td>
    <td class="num">${money(data.amountKopecks)}</td>
  </tr>
</table>

<div class="total">
  Итого: <strong>${money(data.amountKopecks)} ₽</strong><br>
  <span class="muted">Без НДС (упрощённая система налогообложения, п. 2 ст. 346.11 НК РФ)</span>
</div>

<p class="words">Всего к оплате: <strong>${e(amountInWords(data.amountKopecks))}</strong></p>

<div class="purpose">
  <strong>В назначении платежа обязательно укажите:</strong><br>
  ${e(purpose)}
  <br><span class="muted">Без номера счёта платёж придётся сверять вручную, и доступ включится позже.</span>
</div>

<div class="sign">
  Исполнитель <span class="sign-line"></span>
  <span class="muted">${e(seller.name)}</span>
</div>

</body></html>`;
}
