const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const PDFDocument = require('pdfkit');
const {
  getEntity,
  listEntities,
  getEntitiesByIds,
  createEntityIfAbsent,
  updateEntity,
  queryEntities,
  queryPaymentRequestsByBarStatus,
  decodeLastEvaluatedKey
} = require('./lib/dynamodb');
const { buildOrderSummary } = require('./lib/orderSummary');
const { classifyRepaymentAllocations, normalizeCreditPaymentMethod } = require('./lib/creditPayments');
const { getPaymentCreatedAtQueryWindow } = require('./lib/paymentExpiry');

const REPORT_TIME_ZONE = 'Africa/Blantyre';
const MALAWI_OFFSET_MINUTES = 120;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const REPORT_COLORS = {
  ink: '#18313F',
  muted: '#607681',
  teal: '#087F78',
  amber: '#E3A53B',
  paper: '#F2F6F5',
  line: '#D8E2E2',
  white: '#FFFFFF'
};
const PAYMENT_TENDER_LABELS = {
  cash: 'Cash',
  airtel_money: 'Airtel Money',
  mpamba: 'Mpamba',
  bank_account: 'Bank Account'
};
const PAYMENT_TENDER_ORDER = ['cash', 'airtel_money', 'mpamba', 'bank_account'];
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

const getCalendarDate = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getReportWindow = (referenceTime = new Date(), reportDate = null) => {
  const localDate = reportDate || getCalendarDate(new Date(referenceTime));
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!dateMatch) {
    throw new Error('Report date must be in YYYY-MM-DD format.');
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    normalizedDate.getUTCFullYear() !== year
    || normalizedDate.getUTCMonth() !== month - 1
    || normalizedDate.getUTCDate() !== day
  ) {
    throw new Error('Report date is invalid.');
  }

  const endExclusiveMs = Date.UTC(year, month - 1, day, 6)
    - MALAWI_OFFSET_MINUTES * 60 * 1000;
  return {
    reportDate: localDate,
    startDate: new Date(endExclusiveMs - DAY_MILLISECONDS).toISOString(),
    endDate: new Date(endExclusiveMs - 1).toISOString(),
    endExclusive: new Date(endExclusiveMs).toISOString()
  };
};

const formatDateTime = (value) => new Date(value).toLocaleString('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: REPORT_TIME_ZONE
});

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const buildSalesInsights = (orders) => {
  const summary = buildOrderSummary(orders);
  const salesByHour = new Map();
  let firstSaleTime = Infinity;
  let lastSaleTime = -Infinity;

  (orders || []).forEach((order) => {
    const createdAt = new Date(order.createdAt);
    if (Number.isNaN(createdAt.getTime())) return;
    firstSaleTime = Math.min(firstSaleTime, createdAt.getTime());
    lastSaleTime = Math.max(lastSaleTime, createdAt.getTime());
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: REPORT_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(createdAt);
    const hourSummary = salesByHour.get(hour) || { amount: 0, orders: 0 };
    hourSummary.amount += Number(order.totalAmount || 0);
    hourSummary.orders += 1;
    salesByHour.set(hour, hourSummary);
  });

  const busiestHour = [...salesByHour.entries()]
    .sort((left, right) => right[1].amount - left[1].amount)[0];

  return {
    totalSales: summary.totalSales,
    totalProfit: summary.totalProfit,
    totalOrders: summary.totalOrders,
    averageOrderValue: summary.averageOrderValue,
    totalQuantitySold: summary.totalQuantitySold,
    averageItemsPerOrder: summary.averageItemsPerOrder,
    grossMarginRatio: summary.grossMarginRatio,
    paymentMethods: summary.paymentMethods,
    topProducts: summary.topProducts,
    categorySales: summary.categorySales,
    firstSaleAt: Number.isFinite(firstSaleTime) ? new Date(firstSaleTime).toISOString() : null,
    lastSaleAt: Number.isFinite(lastSaleTime) ? new Date(lastSaleTime).toISOString() : null,
    busiestHour: busiestHour
      ? { hour: busiestHour[0], ...busiestHour[1] }
      : null
  };
};

const getOutstandingCreditBalance = (order) => {
  const recordedBalance = Number(order?.balanceDue);
  if (Number.isFinite(recordedBalance) && recordedBalance > 0) return recordedBalance;
  return Math.max(0, Number(order?.totalAmount || 0) - Number(order?.amountPaid || 0));
};

const isOpenCreditOrder = (order) => (
  !order?.reversed
  && order?.paymentStatus !== 'paid'
  && getOutstandingCreditBalance(order) > 0
  && (
    order?.paymentMethod === 'credit'
    || order?.paymentStatus === 'partial'
    || order?.paymentStatus === 'credit'
  )
);

const buildCollectedPaymentMix = (orders, payments, rangeStartTime, rangeEndTime) => {
  const methods = new Map(PAYMENT_TENDER_ORDER.map((method) => [method, { amount: 0, count: 0 }]));
  const addAmount = (method, amount) => {
    const normalizedMethod = String(method || 'cash').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const tenderMethod = normalizedMethod.startsWith('credit_')
      ? normalizedMethod.slice('credit_'.length)
      : normalizedMethod;
    const numericAmount = Number(amount || 0);
    if (!tenderMethod || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
    const methodSummary = methods.get(tenderMethod) || { amount: 0, count: 0 };
    methodSummary.amount += numericAmount;
    methodSummary.count += 1;
    methods.set(tenderMethod, methodSummary);
  };

  (orders || []).forEach((order) => {
    if (order.reversed || String(order.paymentMethod || 'cash').toLowerCase() === 'credit') return;
    addAmount(order.paymentMethod || 'cash', order.totalAmount);
  });

  (payments || []).forEach((payment) => {
    const confirmedAt = Date.parse(payment.confirmedAt || payment.createdAt || '');
    const amount = Number(payment.amountApplied || payment.amountRequested || payment.amount || 0);
    if (
      !Number.isFinite(confirmedAt)
      || confirmedAt < rangeStartTime
      || confirmedAt > rangeEndTime
      || amount <= 0
    ) return;
    addAmount(normalizeCreditPaymentMethod(payment), amount);
  });

  const extraMethods = [...methods.keys()]
    .filter((method) => !PAYMENT_TENDER_ORDER.includes(method))
    .sort();
  return [...PAYMENT_TENDER_ORDER, ...extraMethods].map((method) => ({
    method: PAYMENT_TENDER_LABELS[method] || method.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
    amount: methods.get(method).amount,
    count: methods.get(method).count
  }));
};

const calculateCollectionSummary = ({ orders, payments, creditOrdersForSettlement = [], window }) => {
  const rangeStartTime = Date.parse(window.startDate);
  const rangeEndTime = Date.parse(window.endDate);
  const outstandingCreditInPeriod = (orders || [])
    .filter(isOpenCreditOrder)
    .reduce((sum, order) => sum + getOutstandingCreditBalance(order), 0);
  const creditOrderStates = (creditOrdersForSettlement || [])
    .filter(isOpenCreditOrder)
    .map((order) => ({
      createdAt: Date.parse(order.createdAt || ''),
      balanceDue: getOutstandingCreditBalance(order)
    }))
    .filter((order) => Number.isFinite(order.createdAt))
    .sort((left, right) => left.createdAt - right.createdAt);

  let previousBillsCollected = 0;
  let creditOrderIndex = 0;
  const orderedPayments = (payments || [])
    .map((payment) => ({
      amount: Number(payment.amountApplied || payment.amountRequested || payment.amount || 0),
      allocations: payment.allocations,
      confirmedAt: Date.parse(payment.confirmedAt || payment.createdAt || '')
    }))
    .filter((payment) => payment.amount > 0 && payment.confirmedAt >= rangeStartTime && payment.confirmedAt <= rangeEndTime)
    .sort((left, right) => left.confirmedAt - right.confirmedAt);

  orderedPayments.forEach((payment) => {
    if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
      const allocationSummary = classifyRepaymentAllocations(payment, rangeStartTime, rangeEndTime);
      previousBillsCollected += allocationSummary.previousAmount;
      return;
    }

    let remaining = payment.amount;
    while (remaining > 0 && creditOrderIndex < creditOrderStates.length) {
      const nextOrder = creditOrderStates[creditOrderIndex];
      if (nextOrder.balanceDue <= 0) {
        creditOrderIndex += 1;
        continue;
      }

      const applied = Math.min(remaining, nextOrder.balanceDue);
      if (nextOrder.createdAt < rangeStartTime) previousBillsCollected += applied;
      nextOrder.balanceDue -= applied;
      remaining -= applied;
      if (nextOrder.balanceDue <= 0) creditOrderIndex += 1;
    }
  });

  const totalSales = (orders || []).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const paymentMix = buildCollectedPaymentMix(orders, payments, rangeStartTime, rangeEndTime);
  return {
    outstandingCreditInPeriod,
    previousBillsCollected,
    amountToCollect: Math.max(0, totalSales - outstandingCreditInPeriod + previousBillsCollected),
    paymentMix
  };
};

const drawKpi = (document, { x, y, width, label, value, highlight = false }) => {
  const height = 66;
  document.roundedRect(x, y, width, height, 5)
    .fill(highlight ? REPORT_COLORS.teal : REPORT_COLORS.paper);
  document.fillColor(highlight ? '#D5F1EB' : REPORT_COLORS.muted)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(label.toUpperCase(), x + 12, y + 10, { width: width - 24, lineBreak: false });

  let valueSize = highlight ? 16 : 15;
  document.fillColor(highlight ? REPORT_COLORS.white : REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(valueSize);
  while (document.widthOfString(value) > width - 24 && valueSize > 10) {
    valueSize -= 1;
    document.fontSize(valueSize);
  }
  document.text(value, x + 12, y + 29, { width: width - 24, lineBreak: false, ellipsis: true });
};

const drawInsightBar = (document, { x, y, width, label, detail, share, color }) => {
  const safeShare = Math.max(0, Math.min(1, Number(share) || 0));
  document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(9)
    .text(label, x, y, { width: width * 0.52, lineBreak: false, ellipsis: true });
  document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(8)
    .text(detail, x + width * 0.52, y, { width: width * 0.48, align: 'right', lineBreak: false, ellipsis: true });
  document.roundedRect(x, y + 14, width, 5, 2).fill(REPORT_COLORS.paper);
  if (safeShare > 0) {
    document.roundedRect(x, y + 14, Math.max(5, width * safeShare), 5, 2).fill(color);
  }
};

const createSalesPdf = async ({ barName, orders, window, collectionSummary }) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 42 });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.on('error', reject);

  const insights = buildSalesInsights(orders);
  const collection = collectionSummary || calculateCollectionSummary({ orders, payments: [], window });
  const pageWidth = document.page.width;
  const contentX = 42;
  const contentWidth = pageWidth - contentX * 2;

  document.rect(0, 0, pageWidth, 138).fill(REPORT_COLORS.ink);
  document.rect(0, 134, pageWidth, 4).fill(REPORT_COLORS.amber);
  document.fillColor('#C5D8D8').font('Helvetica-Bold').fontSize(8)
    .text('SMARTBAR  /  OPERATIONS', contentX, 24, { characterSpacing: 1.2 });
  document.fillColor(REPORT_COLORS.white).font('Helvetica-Bold').fontSize(23)
    .text('Daily Sales Brief', contentX, 49, { width: contentWidth });
  document.font('Helvetica').fontSize(11).fillColor('#E0ECEB')
    .text(barName || 'Bar', contentX, 82, { width: contentWidth });
  document.fontSize(9).fillColor('#C5D8D8')
    .text(`${formatDateTime(window.startDate)} to ${formatDateTime(window.endExclusive)} CAT`, contentX, 101, { width: contentWidth });
  document.fontSize(8).fillColor('#C5D8D8')
    .text(`Generated ${formatDateTime(new Date())} CAT`, contentX, 117, { width: contentWidth });

  document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(12)
    .text('At a glance', contentX, 157);
  const cardGap = 9;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const kpis = [
    { label: 'Total sales', value: `MK ${formatMoney(insights.totalSales)}` },
    { label: 'Expected handover', value: `MK ${formatMoney(collection.amountToCollect)}`, highlight: true },
    { label: 'Net profit', value: `MK ${formatMoney(insights.totalProfit)}` },
    { label: 'Orders', value: String(insights.totalOrders) },
    { label: 'Average order', value: `MK ${formatMoney(insights.averageOrderValue)}` },
    { label: 'Gross margin', value: `${formatMoney(insights.grossMarginRatio)}%` }
  ];
  kpis.forEach((kpi, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    drawKpi(document, {
      ...kpi,
      x: contentX + column * (cardWidth + cardGap),
      y: 180 + row * 75,
      width: cardWidth
    });
  });

  const reconciliationY = 331;
  document.roundedRect(contentX, reconciliationY, contentWidth, 41, 5).fill('#E8F3F1');
  document.fillColor(REPORT_COLORS.teal).font('Helvetica-Bold').fontSize(8)
    .text('COLLECTION RECONCILIATION', contentX + 12, reconciliationY + 7);
  document.fillColor(REPORT_COLORS.ink).font('Helvetica').fontSize(8)
    .text(`MK ${formatMoney(insights.totalSales)} sales - MK ${formatMoney(collection.outstandingCreditInPeriod)} unpaid period credit + MK ${formatMoney(collection.previousBillsCollected)} older-bill repayments = MK ${formatMoney(collection.amountToCollect)} to collect`, contentX + 12, reconciliationY + 21, {
      width: contentWidth - 24,
      lineBreak: false,
      ellipsis: true
    });

  const insightY = 382;
  document.roundedRect(contentX, insightY, contentWidth, 52, 5).fill('#F8F4E9');
  document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(8)
    .text('SALES ACTIVITY', contentX + 12, insightY + 8);
  const saleTimingText = insights.firstSaleAt && insights.lastSaleAt
    ? `First sale: ${formatDateTime(insights.firstSaleAt)}  |  Last sale: ${formatDateTime(insights.lastSaleAt)} CAT`
    : 'First and last sale time unavailable';
  document.font('Helvetica').fontSize(8).fillColor(REPORT_COLORS.ink)
    .text(saleTimingText, contentX + 112, insightY + 8, {
      width: contentWidth - 124,
      lineBreak: false,
      ellipsis: true
    });
  const peakText = insights.busiestHour
    ? `Peak hour ${insights.busiestHour.hour}:00-${insights.busiestHour.hour}:59  |  MK ${formatMoney(insights.busiestHour.amount)} sales`
    : 'Peak hour unavailable';
  document.font('Helvetica').fontSize(9).fillColor(REPORT_COLORS.ink)
    .text(`${formatMoney(insights.totalQuantitySold)} items sold  |  ${formatMoney(insights.averageItemsPerOrder)} items/order  |  ${peakText}`, contentX + 12, insightY + 28, {
      width: contentWidth - 24,
      lineBreak: false,
      ellipsis: true
    });

  const sectionY = 444;
  const columnGap = 24;
  const columnWidth = (contentWidth - columnGap) / 2;
  const rightX = contentX + columnWidth + columnGap;
  document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(12)
    .text('Collected by method', contentX, sectionY);
  document.text('Top products', rightX, sectionY);
  document.moveTo(contentX, sectionY + 19).lineTo(contentX + columnWidth, sectionY + 19).strokeColor(REPORT_COLORS.line).stroke();
  document.moveTo(rightX, sectionY + 19).lineTo(rightX + columnWidth, sectionY + 19).strokeColor(REPORT_COLORS.line).stroke();

  const paymentRows = collection.paymentMix.slice(0, 5);
  const totalCollectedByMethod = paymentRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  if (paymentRows.length === 0) {
    document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(9).text('No payment data', contentX, sectionY + 31);
  } else {
    paymentRows.forEach((payment, index) => {
      const share = totalCollectedByMethod > 0 ? payment.amount / totalCollectedByMethod : 0;
      drawInsightBar(document, {
        x: contentX,
        y: sectionY + 30 + index * 35,
        width: columnWidth,
        label: payment.method,
        detail: `MK ${formatMoney(payment.amount)}  ${formatMoney(share * 100)}%`,
        share,
        color: index === 0 ? REPORT_COLORS.teal : '#76AAA4'
      });
    });
  }

  const productRows = insights.topProducts.slice(0, 5);
  const highestProductRevenue = productRows[0]?.revenue || 0;
  if (productRows.length === 0) {
    document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(9).text('No product-level data', rightX, sectionY + 31);
  } else {
    productRows.forEach((product, index) => {
      drawInsightBar(document, {
        x: rightX,
        y: sectionY + 30 + index * 35,
        width: columnWidth,
        label: product.name,
        detail: `${formatMoney(product.quantity)} sold  |  MK ${formatMoney(product.revenue)}`,
        share: highestProductRevenue > 0 ? product.revenue / highestProductRevenue : 0,
        color: index === 0 ? REPORT_COLORS.amber : '#E8C47D'
      });
    });
  }

  const categoryY = 652;
  document.fillColor(REPORT_COLORS.ink).font('Helvetica-Bold').fontSize(12)
    .text('Category contribution', contentX, categoryY);
  document.moveTo(contentX, categoryY + 19).lineTo(contentX + contentWidth, categoryY + 19).strokeColor(REPORT_COLORS.line).stroke();
  const categoryRows = insights.categorySales.slice(0, 3);
  if (categoryRows.length === 0) {
    document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(9)
      .text('No category-level sales data', contentX, categoryY + 31);
  } else {
    categoryRows.forEach((category, index) => {
      const share = insights.totalSales > 0 ? category.revenue / insights.totalSales : 0;
      drawInsightBar(document, {
        x: contentX,
        y: categoryY + 29 + index * 34,
        width: contentWidth,
        label: category.name,
        detail: `MK ${formatMoney(category.revenue)}  |  ${formatMoney(share * 100)}% of sales`,
        share,
        color: index === 0 ? REPORT_COLORS.teal : '#76AAA4'
      });
    });
  }

  const footerY = document.page.height - 28;
  document.moveTo(contentX, footerY - 8).lineTo(contentX + contentWidth, footerY - 8).strokeColor(REPORT_COLORS.line).stroke();
  document.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(7)
    .text('SMARTBAR  |  Daily management summary  |  Amounts in MK', contentX, footerY, { width: contentWidth });
  document.end();
});

const formatEmailHeader = (addresses) => (Array.isArray(addresses) ? addresses : [addresses])
  .filter(Boolean)
  .join(', ');

const buildRawEmail = ({ from, to, cc = [], subject, text, filename, attachment }) => {
  const boundary = `bar-report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const encodedAttachment = attachment.toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const message = [
    `From: ${from}`,
    `To: ${formatEmailHeader(to)}`,
    ...(formatEmailHeader(cc) ? [`Cc: ${formatEmailHeader(cc)}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    encodedAttachment,
    `--${boundary}--`,
    ''
  ].join('\r\n');
  return Buffer.from(message);
};

const buildDailyReportText = ({ barName, window }) => (
  `Bar: ${barName || 'Bar'}\r\n\r\n`
  + `Attached is the sales report for ${formatDateTime(window.startDate)} to ${formatDateTime(window.endExclusive)}.`
);

const buildNoSalesReminderText = ({ barName, window }) => (
  `Hello,\r\n\r\n`
  + `We did not record sales for ${barName || 'your bar'} during `
  + `${formatDateTime(window.startDate)} to ${formatDateTime(window.endExclusive)} CAT.\r\n\r\n`
  + `If you are still getting set up, add your products and prices in SmartBar, then you will be ready to start recording sales. `
  + `To complete setup, go to www.smartbarmw.tech. `
  + `For help getting started or loading products, contact our support team on WhatsApp at 0995718815.\r\n\r\n`
  + `Please do not reply to this email. This inbox is not monitored. For assistance, contact us on WhatsApp at 0995718815.\r\n\r\n`
  + `SmartBar Support`
);

const buildRawTextEmail = ({ from, to, subject, text }) => {
  const encodedText = Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const message = [
    `From: ${from}`,
    `To: ${formatEmailHeader(to)}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedText
  ].join('\r\n');
  return Buffer.from(message);
};

const collectBarOrders = async (barId, window) => {
  const orders = [];
  let lastEvaluatedKey;

  do {
    const result = await queryEntities('order', {
      barId,
      startDate: window.startDate,
      endDate: window.endDate,
      includeReversed: false,
      scanIndexForward: true,
      limit: 100,
      ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
    });
    orders.push(...(result.items || []));
    lastEvaluatedKey = result.lastEvaluatedKey
      ? decodeLastEvaluatedKey(result.lastEvaluatedKey)
      : null;
  } while (lastEvaluatedKey);

  return orders.filter((order) => Number(order.totalAmount || 0) > 0);
};

const getBarCollectionSummary = async (barId, orders, window) => {
  const paymentQueryWindow = getPaymentCreatedAtQueryWindow(window.startDate, window.endDate);
  const payments = [];
  let lastEvaluatedKey;

  do {
    const result = await queryPaymentRequestsByBarStatus(barId, 'confirmed', {
      ...paymentQueryWindow,
      scanIndexForward: true,
      limit: 100,
      ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
    });
    payments.push(...(result.items || []));
    lastEvaluatedKey = result.lastEvaluatedKey
      ? decodeLastEvaluatedKey(result.lastEvaluatedKey)
      : null;
  } while (lastEvaluatedKey);

  const periodPayments = payments.filter((payment) => {
    const confirmedAt = Date.parse(payment.confirmedAt || payment.createdAt || '');
    return Number.isFinite(confirmedAt)
      && confirmedAt >= Date.parse(window.startDate)
      && confirmedAt <= Date.parse(window.endDate);
  });
  const hasUnallocatedPayment = periodPayments.some((payment) => (
    Number(payment.amountApplied || payment.amountRequested || payment.amount || 0) > 0
    && (!Array.isArray(payment.allocations) || payment.allocations.length === 0)
  ));
  let creditOrdersForSettlement = [];

  if (hasUnallocatedPayment) {
    const historicalOrders = await queryEntities('order', {
      barId,
      includeReversed: false
    });
    creditOrdersForSettlement = (historicalOrders.items || []).filter(isOpenCreditOrder);
  }

  return calculateCollectionSummary({ orders, payments: periodPayments, creditOrdersForSettlement, window });
};

const getReferenceId = (reference) => {
  if (reference && typeof reference === 'object') {
    return String(reference._id || reference.id || reference.categoryId || '').trim();
  }
  return String(reference || '').trim();
};

const resolveOrderCategoryNames = (orders, products, categories, barId) => {
  const productsById = new Map((products || [])
    .filter((product) => String(product.barId || '') === String(barId))
    .map((product) => [String(product._id || product.id), product]));
  const categoriesById = new Map((categories || [])
    .filter((category) => String(category.barId || '') === String(barId))
    .map((category) => [String(category._id || category.id), category]));

  return (orders || []).map((order) => ({
    ...order,
    items: (order.items || []).map((item) => {
      const productId = getReferenceId(item.product?._id || item.product || item.productId || item._id);
      const product = productsById.get(productId);
      const categoryReference = product?.category || item.category;
      const categoryId = getReferenceId(categoryReference);
      const category = categoryReference && typeof categoryReference === 'object' && categoryReference.name
        ? categoryReference
        : categoriesById.get(categoryId);
      const categoryName = item.categoryName
        || item.product?.category?.name
        || category?.name
        || product?.categoryName;

      return categoryName ? { ...item, categoryName } : item;
    })
  }));
};

const hydrateOrderCategoryNames = async (orders, barId) => {
  const missingCategoryItems = (orders || []).flatMap((order) => (order.items || [])
    .filter((item) => !item.categoryName && !item.product?.category?.name));
  const productIds = Array.from(new Set(missingCategoryItems
    .map((item) => getReferenceId(item.product?._id || item.product || item.productId || item._id))
    .filter(Boolean)));
  if (productIds.length === 0) return orders || [];

  const products = await getEntitiesByIds('product', productIds);
  const categoryIds = Array.from(new Set(products
    .filter((product) => String(product.barId || '') === String(barId))
    .map((product) => getReferenceId(product.category))
    .filter(Boolean)));
  const categories = categoryIds.length > 0
    ? await getEntitiesByIds('category', categoryIds)
    : [];

  return resolveOrderCategoryNames(orders, products, categories, barId);
};

const isValidEmail = (email) => (
  typeof email === 'string'
  && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)
  && !/[\r\n]/.test(email)
);

const getBarOwnerRecipient = (bar, owner) => {
  const barId = String(bar?._id || bar?.id || '');
  if (
    !barId
    || !bar?.ownerUserId
    || !owner
    || owner.role !== 'owner'
    || String(owner.barId || '') !== barId
  ) return '';

  const email = String(owner.email || '').trim();
  return isValidEmail(email) ? email : '';
};

const getBarReportRecipients = (bar, owner) => {
  const ownerEmail = getBarOwnerRecipient(bar, owner);
  const to = [...new Set((Array.isArray(bar?.dailyReportRecipients) ? bar.dailyReportRecipients : [])
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(isValidEmail))];

  if (to.length === 0) {
    return { to: ownerEmail ? [ownerEmail] : [], cc: [] };
  }

  return {
    to,
    cc: ownerEmail && !to.includes(ownerEmail.toLowerCase()) ? [ownerEmail] : []
  };
};

const sendReport = async ({ to, cc, from, barName, pdf, window }) => {
  const filename = `sales-report-${window.reportDate}.pdf`;
  const raw = buildRawEmail({
    from,
    to,
    cc,
    subject: `Daily sales report - ${window.reportDate}`,
    text: buildDailyReportText({ barName, window }),
    filename,
    attachment: pdf
  });
  await sesClient.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
};

const sendNoSalesReminder = async ({ to, from, barName, window }) => {
  const raw = buildRawTextEmail({
    from,
    to,
    subject: 'Help getting started with SmartBar',
    text: buildNoSalesReminderText({ barName, window })
  });
  await sesClient.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
};

const handler = async (event = {}) => {
  const referenceTime = event.time || new Date();
  const window = getReportWindow(referenceTime, event.reportDate || null);
  const from = process.env.SES_FROM_EMAIL;
  if (!from || !isValidEmail(from)) {
    throw new Error('Set SES_FROM_EMAIL to a verified sender address.');
  }

  const bars = await listEntities('bar');
  const selectedBars = event.barId
    ? bars.filter((bar) => String(bar._id || bar.id) === String(event.barId))
    : bars;
  if (event.barId && selectedBars.length === 0) {
    throw new Error(`Bar not found: ${event.barId}`);
  }

  const results = {
    reportDate: window.reportDate,
    sent: 0,
    noSalesRemindersSent: 0,
    noSalesRemindersPreviouslyAttempted: 0,
    skipped: 0,
    failed: []
  };
  for (const bar of selectedBars) {
    if (['suspended', 'deleted'].includes(String(bar.status || '').toLowerCase())) {
      results.skipped += 1;
      continue;
    }

    try {
      const orders = await collectBarOrders(bar._id || bar.id, window);
      if (orders.length === 0) {
        results.skipped += 1;
        const barId = String(bar._id || bar.id);
        if (String(bar.status || '').toLowerCase() !== 'active') {
          console.info('No sales reminder not sent for inactive bar', barId);
          continue;
        }

        const owner = bar.ownerUserId ? await getEntity('user', bar.ownerUserId) : null;
        const recipient = getBarOwnerRecipient(bar, owner);
        if (!recipient) {
          console.warn('No sales reminder skipped because the linked owner has no valid email', barId);
          continue;
        }

        const attemptedAt = new Date().toISOString();
        const claimed = await createEntityIfAbsent('dailySalesNoSalesReminder', {
          id: barId,
          barId,
          ownerUserId: bar.ownerUserId,
          recipient,
          reportDate: window.reportDate,
          status: 'claimed',
          attemptedAt
        });
        if (!claimed) {
          results.noSalesRemindersPreviouslyAttempted += 1;
          console.info('No-sales reminder already attempted; skipped bar', barId);
          continue;
        }

        await sendNoSalesReminder({ to: recipient, from, barName: bar.name || 'your bar', window });
        await updateEntity('dailySalesNoSalesReminder', barId, {
          status: 'sent',
          sentAt: new Date().toISOString()
        });
        results.noSalesRemindersSent += 1;
        console.info('One-time no-sales reminder sent', { barId, reportDate: window.reportDate });
        continue;
      }

      const barId = String(bar._id || bar.id);
      const owner = bar.ownerUserId ? await getEntity('user', bar.ownerUserId) : null;
      const recipients = getBarReportRecipients(bar, owner);
      if (recipients.to.length === 0) {
        results.skipped += 1;
        console.warn('Skipped bar with no valid daily report recipient or linked owner email', barId);
        continue;
      }
      const reportOrders = await hydrateOrderCategoryNames(orders, barId);
      const collectionSummary = await getBarCollectionSummary(barId, orders, window);
      const pdf = await createSalesPdf({ barName: bar.name, orders: reportOrders, window, collectionSummary });
      await sendReport({ ...recipients, from, barName: bar.name || 'Bar', pdf, window });
      results.sent += 1;
      console.info('Sales report sent', { barId: bar._id || bar.id, reportDate: window.reportDate });
    } catch (error) {
      results.failed.push(String(bar._id || bar.id));
      console.error('Sales report failed for bar', bar._id || bar.id, error);
    }
  }

  if (results.failed.length > 0) {
    console.error('Daily sales report has bars requiring targeted retry', results);
  }
  return results;
};

module.exports = {
  handler,
  getReportWindow,
  buildSalesInsights,
  calculateCollectionSummary,
  getBarOwnerRecipient,
  getBarReportRecipients,
  resolveOrderCategoryNames,
  createSalesPdf,
  buildRawEmail,
  buildDailyReportText,
  buildNoSalesReminderText,
  buildRawTextEmail,
  collectBarOrders
};