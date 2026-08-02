import { renderInvoiceHtml } from './apps/server/dist/invoices/invoice-template.js';
import { chromium } from 'playwright';

const html = renderInvoiceHtml(
  {
    number: 42, year: 2026, date: new Date('2026-08-03T10:00:00Z'),
    buyerName: 'Всероссийская федерация лёгкой атлетики',
    buyerInn: '7704217370',
    description: 'Доступ к сервису «Вручай», тариф «Про», 12 месяцев',
    amountKopecks: 6_900_000,
  },
  {
    name: 'ИП Рязанцева Наталья Сергеевна', inn: '740270417047', ogrnip: '326745600068030',
    address: '456830, Челябинская обл., г. Касли, ул. Чехова, д. 14',
    account: '40802810100000000000', bank: 'АО «Точка»', bik: '044525104',
    corrAccount: '30101810745374525104',
  },
);
const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setContent(html, { waitUntil: 'domcontentloaded' });
const pdf = await p.pdf({ format: 'A4', printBackground: true, margin: { top:'14mm', right:'14mm', bottom:'14mm', left:'14mm' } });
const fs = await import('node:fs');
fs.writeFileSync('/tmp/schet.pdf', pdf);
console.log('счёт напечатан,', pdf.length, 'байт');
await b.close();
