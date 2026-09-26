const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { listEntities, queryEntities, decodeLastEvaluatedKey, queryActiveCreditOrdersByBar } = require('../lib/dynamodb');
const { applyExportLimit, getExportLimit, createTopNCollector } = require('../lib/exportLimit');
const { formatCurrencyValue, buildPeriodLabel } = require('../lib/exportFormatting');

router.use(protect, isBarOwnerOrSales);

const REPORT_TIME_ZONE = 'Africa/Blantyre';
const SALES_RANGES = new Set(['today', 'week', 'month', 'year', 'custom']);

// Helper function to format date
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: REPORT_TIME_ZONE
  });
};

const drawPdfCell = (doc, value, x, y, width) => {
  doc.text(String(value ?? ''), x, y, {
    width,
    lineBreak: false,
    ellipsis: true
  });
};

const MALAWI_OFFSET_MINUTES = 120;

const parseLocalDateBoundary = (value, endOfDay = false) => {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const utcValue = Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    const normalized = new Date(Date.UTC(year, month - 1, day));
    if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
      return null;
    }
    return new Date(utcValue - MALAWI_OFFSET_MINUTES * 60000).toISOString();
  }

  const localDateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (localDateTimeMatch) {
    const [, year, month, day, hour, minute, second = '0', milliseconds = '0'] = localDateTimeMatch;
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    const numericHour = Number(hour);
    const numericMinute = Number(minute);
    const numericSecond = Number(second);
    const numericMilliseconds = Number(milliseconds.padEnd(3, '0'));
    const normalized = new Date(Date.UTC(
      numericYear,
      numericMonth - 1,
      numericDay,
      numericHour,
      numericMinute,
      numericSecond,
      numericMilliseconds
    ));

    if (
      normalized.getUTCFullYear() !== numericYear
      || normalized.getUTCMonth() !== numericMonth - 1
      || normalized.getUTCDate() !== numericDay
      || normalized.getUTCHours() !== numericHour
      || normalized.getUTCMinutes() !== numericMinute
      || normalized.getUTCSeconds() !== numericSecond
      || normalized.getUTCMilliseconds() !== numericMilliseconds
    ) {
      return null;
    }

    return new Date(normalized.getTime() - MALAWI_OFFSET_MINUTES * 60000).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const validateCustomDateRange = (query) => {
  const range = String(query.range || '').toLowerCase();
  if (range !== 'custom') {
    return null;
  }

  if (!query.startDate || !query.endDate) {
    return 'Custom date range requires both start and end dates.';
  }

  const startDate = parseLocalDateBoundary(query.startDate, false);
  const endDate = parseLocalDateBoundary(query.endDate, true);

  if (!startDate || !endDate) {
    return 'Custom date range contains an invalid date value.';
  }

  if (new Date(startDate) > new Date(endDate)) {
    return 'Start date cannot be after end date.';
  }

  return null;
};

const validateSalesQuery = (query) => {
  const range = String(query.range || 'week').toLowerCase();
  if (!SALES_RANGES.has(range)) {
    return 'Sales report range must be today, week, month, year, or custom.';
  }

  return validateCustomDateRange({ ...query, range });
};

const getSalesDateRange = (query) => {
  const range = String(query.range || 'week').toLowerCase();
  let startDate = null;
  let endDate = new Date().toISOString();

  if (range === 'today') {
    const now = new Date();
    const localNow = new Date(now.getTime() + MALAWI_OFFSET_MINUTES * 60000);
    const localMidnightUtc = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
    startDate = new Date(localMidnightUtc - MALAWI_OFFSET_MINUTES * 60000).toISOString();
  } else if (range === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    startDate = weekAgo.toISOString();
  } else if (range === 'month') {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    startDate = monthAgo.toISOString();
  } else if (range === 'year') {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    startDate = yearAgo.toISOString();
  } else if (range === 'custom') {
    startDate = parseLocalDateBoundary(query.startDate, false);
    endDate = parseLocalDateBoundary(query.endDate, true) || endDate;
  }

  return { startDate, endDate };
};

const getSalesOrders = async (req) => {
  const limit = getExportLimit('sales');
  const { startDate, endDate } = getSalesDateRange(req.query);
  const orders = [];
  let lastEvaluatedKey;
  let exceeded = false;

  do {
    const result = await queryEntities('order', {
      barId: req.user.barId,
      includeReversed: false,
      startDate,
      endDate,
      limit: 100,
      scanIndexForward: false,
      ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
    });
    orders.push(...(result.items || []));
    lastEvaluatedKey = result.lastEvaluatedKey ? decodeLastEvaluatedKey(result.lastEvaluatedKey) : null;
    if (orders.length > limit) {
      exceeded = true;
      break;
    }
  } while (lastEvaluatedKey);

  const boundedOrders = orders.slice(0, limit + 1);
  return {
    orders: await hydrateOrderCustomers(boundedOrders, req.user.barId),
    totalCount: exceeded ? limit + 1 : orders.length
  };
};

const getOrderCustomerId = (order) => String(
  order?.customer?._id
  || order?.customer?.id
  || order?.customer
  || order?.customerId
  || ''
).trim();

const getEntitiesByIds = async (entityType, barId, ids) => {
  const wantedIds = new Set(ids.map(String));
  if (wantedIds.size === 0) return new Map();
  const recordsById = new Map();
  let lastEvaluatedKey;

  do {
    const result = await listEntities(entityType, {
      barId,
      limit: 100,
      ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
    });
    for (const record of result.items || []) {
      const id = String(record._id || record.id);
      if (wantedIds.has(id)) recordsById.set(id, record);
    }
    lastEvaluatedKey = result.lastEvaluatedKey
      ? decodeLastEvaluatedKey(result.lastEvaluatedKey)
      : null;
  } while (lastEvaluatedKey && recordsById.size < wantedIds.size);

  return recordsById;
};

const hydrateOrderCustomers = async (orders, barId) => {
  const customerIds = Array.from(new Set((orders || []).map(getOrderCustomerId).filter(Boolean)));
  if (customerIds.length === 0) {
    return orders || [];
  }

  const customerMap = await getEntitiesByIds('customer', barId, customerIds);

  return (orders || []).map((order) => {
    const customer = customerMap.get(getOrderCustomerId(order));
    return customer ? Object.assign(order, { customer }) : order;
  });
};

const hydrateProductCategories = async (products, barId) => {
  const categoryIds = Array.from(new Set((products || [])
    .map((product) => String(product?.category?._id || product?.category?.id || product?.category || '').trim())
    .filter(Boolean)));
  if (categoryIds.length === 0) {
    return products || [];
  }

  const categoryMap = await getEntitiesByIds('category', barId, categoryIds);

  return (products || []).map((product) => {
    const categoryId = String(product?.category?._id || product?.category?.id || product?.category || '').trim();
    const category = categoryMap.get(categoryId);
    return category ? Object.assign(product, { category }) : product;
  });
};

const getOrderOutstandingBalance = (order) => {
  const totalAmount = Number(order?.totalAmount || 0);
  const amountPaid = Number(order?.amountPaid || 0);
  const recordedBalance = Number(order?.balanceDue);
  if (Number.isFinite(recordedBalance) && recordedBalance > 0) {
    return recordedBalance;
  }

  return Math.max(0, Number.isFinite(totalAmount - amountPaid) ? totalAmount - amountPaid : 0);
};

const isOpenCreditOrder = (order) => (
  !order?.reversed
  && getOrderOutstandingBalance(order) > 0
  && (
    order?.paymentMethod === 'credit'
    || order?.status === 'partial'
    || order?.status === 'credit'
    || order?.paymentStatus === 'partial'
    || order?.paymentStatus === 'credit'
  )
  && order?.paymentStatus !== 'paid'
);

const collectExportEntities = async ({ entityType, barId, limit, compare }) => {
  const collector = compare ? createTopNCollector(limit + 1, compare) : null;
  const rows = [];
  let totalCount = 0;
  let lastEvaluatedKey;

  do {
    const result = await listEntities(entityType, {
      barId,
      limit: 100,
      ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
    });
    const pageItems = result.items || [];
    totalCount += pageItems.length;

    if (collector) {
      pageItems.forEach((item) => collector.add(item));
    } else {
      rows.push(...pageItems.slice(0, limit + 1 - rows.length));
      if (rows.length > limit) {
        return { rows, totalCount: limit + 1 };
      }
    }

    lastEvaluatedKey = result.lastEvaluatedKey
      ? decodeLastEvaluatedKey(result.lastEvaluatedKey)
      : null;
  } while (lastEvaluatedKey);

  return {
    rows: collector ? collector.getSorted() : rows,
    totalCount
  };
};

const getOutstandingCreditAccounts = async (barId) => {
  const accountLimit = getExportLimit('customers');
  const topAccounts = createTopNCollector(accountLimit + 1, (left, right) => right.balance - left.balance);
  let lastEvaluatedKey;
  let currentAccount = null;
  let accountCount = 0;
  let totalBalance = 0;

  const retainCurrentAccount = () => {
    if (!currentAccount) return;
    accountCount += 1;
    topAccounts.add(currentAccount);
    currentAccount = null;
  };

  do {
    const result = await queryActiveCreditOrdersByBar(barId, {
      limit: 100,
      ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
    });

    for (const order of result.items || []) {
      if (!isOpenCreditOrder(order)) continue;
      const customerId = getOrderCustomerId(order);
      if (!customerId) continue;
      if (currentAccount?.customerId !== customerId) {
        retainCurrentAccount();
        currentAccount = {
          customerId,
          balance: 0
        };
      }

      const balance = getOrderOutstandingBalance(order);
      currentAccount.balance += balance;
      totalBalance += balance;
    }

    lastEvaluatedKey = result.lastEvaluatedKey
      ? decodeLastEvaluatedKey(result.lastEvaluatedKey)
      : null;
  } while (lastEvaluatedKey);
  retainCurrentAccount();

  const accounts = topAccounts.getSorted();
  const accountIds = new Set(accounts.map((account) => account.customerId));
  const customersById = await getEntitiesByIds('customer', barId, [...accountIds]);

  return {
    accounts: accounts.map((account) => {
      const customer = customersById.get(account.customerId);
      return {
        customer: customer?.name || customer?.fullName || 'Unknown customer',
        phone: customer?.phone || '',
        balance: account.balance
      };
    }),
    totalBalance,
    totalCount: accountCount
  };
};

const addExportLimitNotice = (sheet, totalCount, limit, endColumn = 'G') => {
  if (totalCount <= limit) {
    return;
  }

  const totalLabel = totalCount > limit ? `at least ${totalCount}` : totalCount;
  const notice = `WARNING: Export limited to the first ${limit} rows. Total matches: ${totalLabel}. Narrow the date range to export the full result.`;
  sheet.addRow([notice]);
  const noticeRow = sheet.getRow(sheet.rowCount);
  noticeRow.font = { italic: true, color: { argb: 'FFB91C1C' } };
  noticeRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF7ED' }
  };
  sheet.mergeCells(`A${sheet.rowCount}:${endColumn}${sheet.rowCount}`);
};

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Export routes are working!' });
});

// Export Sales Report as Excel
router.get('/sales/excel', async (req, res) => {
  try {
    const customRangeError = validateSalesQuery(req.query);
    if (customRangeError) {
      return res.status(400).json({ message: customRangeError });
    }

    const { orders, totalCount: retrievedOrderCount } = await getSalesOrders(req);
    const {
      accounts: outstandingCreditAccounts,
      totalBalance: totalOutstandingCredit,
      totalCount: outstandingAccountCount
    } = await getOutstandingCreditAccounts(req.user.barId);
    const { rows: limitedOrders, totalCount, limit, exceeded } = applyExportLimit(orders, 'sales', retrievedOrderCount);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    worksheet.columns = [
      { header: 'Order #', key: 'orderNumber', width: 20 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Items', key: 'items', width: 15 },
      { header: 'Total Amount (MK)', key: 'totalAmount', width: 20, numFmt: '#,##0.00' },
      { header: 'Profit (MK)', key: 'profit', width: 18, numFmt: '#,##0.00' },
      { header: 'Payment Method', key: 'paymentMethod', width: 18 },
      { header: 'Date', key: 'date', width: 25 }
    ];

    worksheet.insertRow(1, ['Period', buildPeriodLabel(req.query)]);
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { horizontal: 'left' };

    // Style header row
    const headerRow = worksheet.getRow(2);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE94560' }
    };
    headerRow.alignment = { horizontal: 'center' };

    // Add data rows with formatted date
    limitedOrders.forEach(order => {
      worksheet.addRow({
        orderNumber: order.orderNumber,
        customer: order.customer?.name || 'Walk-in',
        items: Array.isArray(order.items) ? order.items.length : 0,
        totalAmount: Number(order.totalAmount || 0),
        profit: Number(order.profit || 0),
        paymentMethod: String(order.paymentMethod || 'unknown').replace('_', ' '),
        date: formatDate(order.createdAt)
      });
    });

    // Add totals row
    const totalSales = limitedOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalProfit = limitedOrders.reduce((sum, o) => sum + Number(o.profit || 0), 0);
    
    const totalsRow = worksheet.addRow({
      orderNumber: 'TOTALS',
      customer: '',
      items: limitedOrders.length,
      totalAmount: totalSales,
      profit: totalProfit,
      paymentMethod: '',
      date: ''
    });
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };

    if (exceeded) {
      res.setHeader('X-Export-Limit', `${limit}`);
      res.setHeader('X-Export-Total-Count', totalCount > limit ? `>=${totalCount}` : `${totalCount}`);
      addExportLimitNotice(worksheet, totalCount, limit);
    }

    const creditSheet = workbook.addWorksheet('Outstanding Credit Accounts');
    creditSheet.columns = [
      { header: 'Customer', key: 'customer', width: 30 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Outstanding Balance (MK)', key: 'balance', width: 22, numFmt: '#,##0.00' }
    ];

    const creditAccountExport = applyExportLimit(outstandingCreditAccounts, 'customers', outstandingAccountCount);
    creditSheet.addRow({
      customer: 'TOTAL OUTSTANDING',
      phone: '',
      balance: totalOutstandingCredit
    });

    creditAccountExport.rows.forEach((entry) => {
      creditSheet.addRow({
        customer: entry.customer,
        phone: entry.phone,
        balance: Number(entry.balance || 0)
      });
    });
    addExportLimitNotice(creditSheet, creditAccountExport.totalCount, creditAccountExport.limit, 'C');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Export Inventory Report as Excel
router.get('/inventory/excel', async (req, res) => {
  try {
    const { rows: products, totalCount: retrievedProductCount } = await collectExportEntities({
      entityType: 'product',
      barId: req.user.barId,
      limit: getExportLimit('inventory')
    });
    const hydratedProducts = await hydrateProductCategories(products, req.user.barId);
    const { rows: limitedProducts, totalCount, limit, exceeded } = applyExportLimit(hydratedProducts, 'inventory', retrievedProductCount);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory Report');

    worksheet.columns = [
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Cost Price (MK)', key: 'costPrice', width: 18, numFmt: '#,##0.00' },
      { header: 'Selling Price (MK)', key: 'sellingPrice', width: 18, numFmt: '#,##0.00' },
      { header: 'Current Stock', key: 'currentStock', width: 15 },
      { header: 'Low Stock Threshold', key: 'threshold', width: 20 },
      { header: 'Status', key: 'status', width: 18 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3498DB' }
    };
    headerRow.alignment = { horizontal: 'center' };

    limitedProducts.forEach(product => {
      const status = product.currentStock <= product.lowStockThreshold ? '⚠️ Low Stock' : '✅ In Stock';
      worksheet.addRow({
        name: product.name,
        category: product.category?.name || 'Uncategorized',
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        currentStock: product.currentStock,
        threshold: product.lowStockThreshold,
        status: status
      });
    });

    if (exceeded) {
      res.setHeader('X-Export-Limit', `${limit}`);
      res.setHeader('X-Export-Total-Count', totalCount > limit ? `>=${totalCount}` : `${totalCount}`);
      addExportLimitNotice(worksheet, totalCount, limit);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Export Customers Report as Excel
router.get('/customers/excel', async (req, res) => {
  try {
    const { rows: customers, totalCount: customerCount } = await collectExportEntities({
      entityType: 'customer',
      barId: req.user.barId,
      limit: getExportLimit('customers'),
      compare: (left, right) => Number(right.totalSpent || 0) - Number(left.totalSpent || 0)
    });
    const { rows: limitedCustomers, totalCount, limit, exceeded } = applyExportLimit(customers, 'customers', customerCount);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customers Report');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Total Spent (MK)', key: 'totalSpent', width: 20, numFmt: '#,##0.00' },
      { header: 'Loyalty Points', key: 'points', width: 18 },
      { header: 'Joined', key: 'joined', width: 25 }
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9B59B6' }
    };
    headerRow.alignment = { horizontal: 'center' };

    limitedCustomers.forEach(customer => {
      worksheet.addRow({
        name: customer.name,
        phone: customer.phone,
        gender: customer.gender,
        totalSpent: customer.totalSpent || 0,
        points: customer.loyaltyPoints || 0,
        joined: formatDate(customer.createdAt)
      });
    });

    if (exceeded) {
      res.setHeader('X-Export-Limit', `${limit}`);
      res.setHeader('X-Export-Total-Count', totalCount > limit ? `>=${totalCount}` : `${totalCount}`);
      addExportLimitNotice(worksheet, totalCount, limit);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Export Sales Report as PDF
router.get('/sales/pdf', async (req, res) => {
  try {
    const customRangeError = validateSalesQuery(req.query);
    if (customRangeError) {
      return res.status(400).json({ message: customRangeError });
    }

    const { orders, totalCount: retrievedOrderCount } = await getSalesOrders(req);
    const { rows: limitedOrders, totalCount, limit, exceeded } = applyExportLimit(orders, 'sales-pdf', retrievedOrderCount);
    const {
      accounts: outstandingCreditAccounts,
      totalBalance: totalOutstandingCredit,
      totalCount: outstandingAccountCount
    } = await getOutstandingCreditAccounts(req.user.barId);
    const creditAccountExport = applyExportLimit(outstandingCreditAccounts, 'customers', outstandingAccountCount);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_report.pdf');

    doc.pipe(res);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleString('en-GB', {
      timeZone: REPORT_TIME_ZONE,
      dateStyle: 'short',
      timeStyle: 'short'
    })}`, { align: 'center' });
    doc.fontSize(11).font('Helvetica-Bold').text(buildPeriodLabel(req.query), { align: 'center' });
    doc.moveDown();

    // Summary
    if (exceeded) {
      res.setHeader('X-Export-Limit', `${limit}`);
      res.setHeader('X-Export-Total-Count', totalCount > limit ? `>=${totalCount}` : `${totalCount}`);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#B91C1C');
      const totalLabel = totalCount > limit ? `at least ${totalCount}` : totalCount;
      doc.text(`WARNING: Export limited to the first ${limit} rows. Total matches: ${totalLabel}. Narrow the date range to export the full result.`, { align: 'center' });
      doc.fillColor('#111827');
      doc.moveDown();
    }

    const totalSales = limitedOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalProfit = limitedOrders.reduce((sum, o) => sum + Number(o.profit || 0), 0);
    
    doc.fontSize(14).font('Helvetica-Bold');
    const summaryTop = doc.y;
    drawPdfCell(doc, `Total Orders: ${limitedOrders.length}`, 50, summaryTop, 220);
    drawPdfCell(doc, `Total Sales: MK ${formatCurrencyValue(totalSales)}`, 300, summaryTop, 250);
    drawPdfCell(doc, `Total Profit: MK ${formatCurrencyValue(totalProfit)}`, 50, summaryTop + 20, 220);
    drawPdfCell(doc, `Outstanding Credit: MK ${formatCurrencyValue(totalOutstandingCredit)}`, 300, summaryTop + 20, 250);
    doc.y = summaryTop + 40;
    doc.moveDown();

    // Table Headers
    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    drawPdfCell(doc, 'Order #', 50, tableTop, 95);
    drawPdfCell(doc, 'Customer', 150, tableTop, 120);
    drawPdfCell(doc, 'Items', 280, tableTop, 55);
    drawPdfCell(doc, 'Amount', 350, tableTop, 75);
    drawPdfCell(doc, 'Payment', 430, tableTop, 65);
    drawPdfCell(doc, 'Date', 500, tableTop, 62);
    
    // Draw header line
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    doc.moveDown();
    let y = doc.y;
    doc.font('Helvetica');

    limitedOrders.forEach((order, index) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
        // Repeat headers on new page
        doc.fontSize(10).font('Helvetica-Bold');
        drawPdfCell(doc, 'Order #', 50, y, 95);
        drawPdfCell(doc, 'Customer', 150, y, 120);
        drawPdfCell(doc, 'Items', 280, y, 55);
        drawPdfCell(doc, 'Amount', 350, y, 75);
        drawPdfCell(doc, 'Payment', 430, y, 65);
        drawPdfCell(doc, 'Date', 500, y, 62);
        doc.moveTo(50, y + 15).lineTo(550, y + 15).stroke();
        y += 25;
        doc.font('Helvetica');
      }
      
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(45, y - 2, 510, 18).fillAndStroke('#f5f5f5', '#f5f5f5');
      }

      doc.fillColor('#111827');
      
      // Format date properly
      const formattedDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: REPORT_TIME_ZONE
      });
      
      drawPdfCell(doc, order.orderNumber || '', 50, y, 95);
      drawPdfCell(doc, order.customer?.name || 'Walk-in', 150, y, 120);
      drawPdfCell(doc, Array.isArray(order.items) ? order.items.length : 0, 280, y, 55);
      drawPdfCell(doc, `MK ${formatCurrencyValue(order.totalAmount)}`, 350, y, 75);
      drawPdfCell(doc, String(order.paymentMethod || 'unknown').replace('_', ' '), 430, y, 65);
      drawPdfCell(doc, formattedDate, 500, y, 62);
      y += 20;
    });

    if (creditAccountExport.exceeded) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#B91C1C');
      doc.text(`Outstanding credit export limited to ${creditAccountExport.limit} accounts; at least ${creditAccountExport.totalCount} accounts matched.`, { align: 'center' });
      doc.fillColor('#111827');
    }

    if (creditAccountExport.rows.length > 0) {
      doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').text('Accumulated Outstanding Credit Accounts', { align: 'center' });
      doc.moveDown();

      const creditTableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      drawPdfCell(doc, 'Customer', 50, creditTableTop, 160);
      drawPdfCell(doc, 'Phone', 220, creditTableTop, 115);
      drawPdfCell(doc, 'Outstanding Balance', 350, creditTableTop, 200);
      doc.moveTo(50, creditTableTop + 15).lineTo(550, creditTableTop + 15).stroke();

      let creditY = creditTableTop + 25;
      doc.font('Helvetica');

      creditAccountExport.rows.forEach((entry, index) => {
        if (creditY > 700) {
          doc.addPage();
          creditY = 50;
          doc.fontSize(10).font('Helvetica-Bold');
          drawPdfCell(doc, 'Customer', 50, creditY, 160);
          drawPdfCell(doc, 'Phone', 220, creditY, 115);
          drawPdfCell(doc, 'Outstanding Balance', 350, creditY, 200);
          doc.moveTo(50, creditY + 15).lineTo(550, creditY + 15).stroke();
          creditY += 25;
          doc.font('Helvetica');
        }

        if (index % 2 === 0) {
          doc.rect(45, creditY - 2, 510, 18).fillAndStroke('#f5f5f5', '#f5f5f5');
        }

        doc.fillColor('#111827');
        drawPdfCell(doc, entry.customer, 50, creditY, 160);
        drawPdfCell(doc, entry.phone || '—', 220, creditY, 115);
        drawPdfCell(doc, `MK ${formatCurrencyValue(entry.balance)}`, 350, creditY, 200);
        creditY += 20;
      });

      doc.fillColor('#111827');
      doc.text(`Total Outstanding: MK ${formatCurrencyValue(totalOutstandingCredit)}`, 50, creditY + 10);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica').fillColor('#111827');
    doc.text('Report generated by Bar Manager System', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;