const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getReportWindow,
  buildSalesInsights,
  calculateCollectionSummary,
  getBarOwnerRecipient,
  getBarReportRecipients,
  resolveOrderCategoryNames,
  createSalesPdf,
  buildRawEmail,
  buildNoSalesReminderText,
  buildRawTextEmail
} = require('./dailySalesReport');

test('report window is the prior 06:00 through current 06:00 Malawi time', () => {
  const window = getReportWindow('2026-10-10T04:05:00.000Z');

  assert.equal(window.reportDate, '2026-10-10');
  assert.equal(window.startDate, '2026-10-09T04:00:00.000Z');
  assert.equal(window.endDate, '2026-10-10T03:59:59.999Z');
  assert.equal(window.endExclusive, '2026-10-10T04:00:00.000Z');
});

test('report window accepts a pinned local date for manual replay', () => {
  const window = getReportWindow('2026-10-10T04:05:00.000Z', '2026-01-02');

  assert.equal(window.startDate, '2026-01-01T04:00:00.000Z');
  assert.equal(window.endExclusive, '2026-01-02T04:00:00.000Z');
});

test('bar report recipient is the email of its linked owner', () => {
  assert.equal(getBarOwnerRecipient(
    { _id: 'bar-1', ownerUserId: 'owner-1' },
    { _id: 'owner-1', barId: 'bar-1', role: 'owner', email: 'owner@example.com' }
  ), 'owner@example.com');
});

test('bar report recipient rejects missing, mismatched, or non-owner accounts', () => {
  const bar = { _id: 'bar-1', ownerUserId: 'owner-1' };
  assert.equal(getBarOwnerRecipient(bar, null), '');
  assert.equal(getBarOwnerRecipient(bar, { barId: 'bar-2', role: 'owner', email: 'owner@example.com' }), '');
  assert.equal(getBarOwnerRecipient(bar, { barId: 'bar-1', role: 'sales', email: 'sales@example.com' }), '');
  assert.equal(getBarOwnerRecipient(bar, { barId: 'bar-1', role: 'owner', email: 'not-an-email' }), '');
});

test('daily report addresses the configured list and copies the linked owner', () => {
  const recipients = getBarReportRecipients(
    { _id: 'bar-1', ownerUserId: 'owner-1', dailyReportRecipients: ['reports@example.com', 'team@example.com'] },
    { _id: 'owner-1', barId: 'bar-1', role: 'owner', email: 'owner@example.com' }
  );

  assert.deepEqual(recipients, {
    to: ['reports@example.com', 'team@example.com'],
    cc: ['owner@example.com']
  });
});

test('daily report falls back to the linked owner when its list is empty', () => {
  const recipients = getBarReportRecipients(
    { _id: 'bar-1', ownerUserId: 'owner-1', dailyReportRecipients: [] },
    { _id: 'owner-1', barId: 'bar-1', role: 'owner', email: 'owner@example.com' }
  );

  assert.deepEqual(recipients, { to: ['owner@example.com'], cc: [] });
});

test('category names are resolved from the bar product and category records', () => {
  const orders = [{ items: [{ product: 'product-1', productName: 'Lager', quantity: 2, subtotal: 1000 }] }];
  const products = [{ _id: 'product-1', barId: 'bar-1', category: 'category-1' }];
  const categories = [{ _id: 'category-1', barId: 'bar-1', name: 'Beer' }];

  const resolved = resolveOrderCategoryNames(orders, products, categories, 'bar-1');
  assert.equal(resolved[0].items[0].categoryName, 'Beer');
});

test('category lookup does not use another bar product/category', () => {
  const orders = [{ items: [{ product: 'product-1', productName: 'Lager', quantity: 2, subtotal: 1000 }] }];
  const products = [{ _id: 'product-1', barId: 'bar-2', category: 'category-1' }];
  const categories = [{ _id: 'category-1', barId: 'bar-2', name: 'Other bar category' }];

  const resolved = resolveOrderCategoryNames(orders, products, categories, 'bar-1');
  assert.equal(resolved[0].items[0].categoryName, undefined);
});

test('sales PDF is generated with a valid PDF signature', async () => {
  const window = getReportWindow('2026-10-10T04:05:00.000Z');
  const pdf = await createSalesPdf({
    barName: 'Test Bar',
    window,
    orders: [{
      id: 'order-1',
      orderNumber: 'A001',
      totalAmount: 1250,
      profit: 250,
      createdAt: '2026-10-09T10:00:00.000Z',
      paymentMethod: 'cash',
      items: [{ name: 'Drink' }]
    }]
  });

  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('sales insights aggregate totals, payment mix, best seller, and peak hour', () => {
  const insights = buildSalesInsights([
    {
      totalAmount: 1000,
      profit: 300,
      paymentMethod: 'cash',
      createdAt: '2026-10-09T12:30:00.000Z',
      items: [{ productName: 'Lager', categoryName: 'Beer', quantity: 2, subtotal: 1000 }]
    },
    {
      totalAmount: 500,
      profit: 100,
      paymentMethod: 'credit',
      createdAt: '2026-10-09T12:45:00.000Z',
      items: [{ productName: 'Lager', categoryName: 'Beer', quantity: 1, subtotal: 500 }]
    }
  ]);

  assert.equal(insights.totalSales, 1500);
  assert.equal(insights.totalProfit, 400);
  assert.equal(insights.totalOrders, 2);
  assert.equal(insights.averageOrderValue, 750);
  assert.equal(insights.totalQuantitySold, 3);
  assert.equal(insights.topProducts[0].name, 'Lager');
  assert.equal(insights.topProducts[0].revenue, 1500);
  assert.equal(insights.categorySales[0].name, 'Beer');
  assert.equal(insights.categorySales[0].revenue, 1500);
  assert.equal(insights.paymentMethods.length, 2);
  assert.equal(insights.firstSaleAt, '2026-10-09T12:30:00.000Z');
  assert.equal(insights.lastSaleAt, '2026-10-09T12:45:00.000Z');
  assert.equal(insights.busiestHour.hour, '14');
  assert.equal(insights.busiestHour.orders, 2);
});

test('collection total adds previous-bill repayments and subtracts unpaid period credit', () => {
  const window = getReportWindow('2026-10-10T04:05:00.000Z');
  const summary = calculateCollectionSummary({
    window,
    orders: [
      { totalAmount: 1000, paymentMethod: 'cash' },
      { totalAmount: 500, paymentMethod: 'credit', balanceDue: 200, paymentStatus: 'partial' }
    ],
    payments: [{
      amountApplied: 150,
      confirmedAt: '2026-10-10T02:00:00.000Z',
      allocations: [{ amount: 150, orderCreatedAt: '2026-10-08T10:00:00.000Z' }]
    }]
  });

  assert.equal(summary.outstandingCreditInPeriod, 200);
  assert.equal(summary.previousBillsCollected, 150);
  assert.equal(summary.amountToCollect, 1450);
});

test('payment mix merges direct POS sales and credit repayments by tender method', () => {
  const window = getReportWindow('2026-10-10T04:05:00.000Z');
  const summary = calculateCollectionSummary({
    window,
    orders: [
      { totalAmount: 201000, paymentMethod: 'cash' },
      { totalAmount: 81000, paymentMethod: 'airtel_money' },
      { totalAmount: 353000, paymentMethod: 'credit', balanceDue: 353000, paymentStatus: 'credit' }
    ],
    payments: [
      { amountApplied: 10000, paymentMethod: 'cash', confirmedAt: '2026-10-10T01:00:00.000Z' },
      { amountApplied: 20000, paymentMethod: 'airtel_money', confirmedAt: '2026-10-10T01:10:00.000Z' },
      { amountApplied: 30000, paymentMethod: 'mpamba', confirmedAt: '2026-10-10T01:20:00.000Z' },
      { amountApplied: 40000, paymentMethod: 'bank_account', confirmedAt: '2026-10-10T01:30:00.000Z' },
      { amountApplied: 90000, paymentMethod: 'cash', confirmedAt: '2026-10-10T04:00:00.000Z' }
    ]
  });
  const mixByMethod = Object.fromEntries(summary.paymentMix.map((entry) => [entry.method, entry.amount]));

  assert.equal(mixByMethod.Cash, 211000);
  assert.equal(mixByMethod['Airtel Money'], 101000);
  assert.equal(mixByMethod.Mpamba, 30000);
  assert.equal(mixByMethod['Bank Account'], 40000);
});

test('legacy unallocated repayments are classified against older credit balances', () => {
  const window = getReportWindow('2026-10-10T04:05:00.000Z');
  const summary = calculateCollectionSummary({
    window,
    orders: [{ totalAmount: 1000, paymentMethod: 'cash' }],
    payments: [{ amountApplied: 150, confirmedAt: '2026-10-10T02:00:00.000Z' }],
    creditOrdersForSettlement: [{
      createdAt: '2026-10-08T10:00:00.000Z',
      totalAmount: 300,
      balanceDue: 300,
      paymentMethod: 'credit',
      paymentStatus: 'credit'
    }]
  });

  assert.equal(summary.previousBillsCollected, 150);
  assert.equal(summary.amountToCollect, 1150);
});

test('raw email includes a PDF attachment with base64 content', () => {
  const raw = buildRawEmail({
    from: 'reports@example.com',
    to: 'owner@example.com',
    subject: 'Daily report',
    text: 'Attached report.',
    filename: 'sales-report.pdf',
    attachment: Buffer.from('%PDF-test')
  }).toString();

  assert.match(raw, /Content-Type: application\/pdf/);
  assert.match(raw, /filename="sales-report\.pdf"/);
  assert.match(raw, /JVBERi10ZXN0/);
});

test('raw email includes the owner as a CC recipient', () => {
  const raw = buildRawEmail({
    from: 'reports@example.com',
    to: ['team@example.com', 'finance@example.com'],
    cc: ['owner@example.com'],
    subject: 'Daily report',
    text: 'Attached report.',
    filename: 'sales-report.pdf',
    attachment: Buffer.from('%PDF-test')
  }).toString();

  assert.match(raw, /To: team@example\.com, finance@example\.com/);
  assert.match(raw, /Cc: owner@example\.com/);
});

test('no-sales reminder gives setup guidance and says not to reply', () => {
  const window = getReportWindow('2026-10-10T04:05:00.000Z');
  const text = buildNoSalesReminderText({ barName: 'Test Bar', window });

  assert.match(text, /We did not record sales for Test Bar during 09\/10\/2026, 06:00 to 10\/10\/2026, 06:00 CAT/);
  assert.match(text, /add your products and prices/);
  assert.match(text, /To complete setup, go to www\.smartbarmw\.tech/);
  assert.match(text, /WhatsApp at 0995718815/);
  assert.match(text, /Please do not reply to this email/);
  assert.match(text, /This inbox is not monitored/);
});

test('no-sales reminder email is plain text without a PDF attachment', () => {
  const text = 'Please do not reply. Contact support on WhatsApp at 0995718815.';
  const raw = buildRawTextEmail({
    from: 'reports@example.com',
    to: 'owner@example.com',
    subject: 'Help getting started with SmartBar',
    text
  }).toString();
  const [headers, encodedBody] = raw.split('\r\n\r\n');

  assert.match(headers, /Content-Type: text\/plain; charset=UTF-8/);
  assert.doesNotMatch(headers, /application\/pdf/);
  assert.equal(Buffer.from(encodedBody.replace(/\r\n/g, ''), 'base64').toString('utf8'), text);
});