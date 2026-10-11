import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { formatPriceMK } from './formatPrice';

const APPLY_URL = 'https://www.smartbarmw.tech/apply';

const getStatementData = (customer) => {
  const outstanding = Number(customer.creditBalance || 0);
  const bills = (Array.isArray(customer.creditSummary) ? customer.creditSummary : [])
    .filter((entry) => Number(entry.balanceDue || 0) > 0);
  const itemizedTotal = bills.reduce((total, entry) => total + Number(entry.balanceDue || 0), 0);
  const unitemizedBalance = outstanding - itemizedTotal;
  const rows = bills.map((entry) => {
    const products = (Array.isArray(entry.products) ? entry.products : [])
      .map((product) => `${product.name || 'Product'} x${product.quantity || 0}`)
      .join('\n') || 'Item details unavailable';

    return [
      entry.orderNumber || 'Credit purchase',
      entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-',
      products,
      formatPriceMK(entry.amountPaid || 0),
      formatPriceMK(entry.balanceDue || 0)
    ];
  });

  if (!bills.length && outstanding > 0) {
    rows.push(['-', '-', 'Opening or unitemized balance', '-', formatPriceMK(outstanding)]);
  } else if (Math.abs(unitemizedBalance) >= 0.01) {
    rows.push([
      '-',
      '-',
      unitemizedBalance > 0 ? 'Opening or unitemized balance' : 'Balance adjustment',
      '-',
      formatPriceMK(unitemizedBalance)
    ]);
  }

  return { outstanding, rows };
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

export const createCustomerStatementPdf = async (customer, businessName, customerAccessUrl = '') => {
  const { outstanding, rows } = getStatementData(customer);
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const qrUrl = customerAccessUrl || APPLY_URL;
  const qrCaption = customerAccessUrl ? 'Scan to check your bill' : 'Interested in this App? Scan here';
  const qrDescription = customerAccessUrl ? 'QR code to view customer bills' : 'QR code to apply at Smart Bar';

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(businessName || 'SMART BAR', 14, 18);
  pdf.setFontSize(12);
  pdf.text('Outstanding Balance Statement', 14, 28);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Customer: ${customer.name || 'Customer'}`, 14, 37);
  pdf.text(`Phone: ${customer.phone || '-'}`, 14, 43);
  pdf.text(`Statement date: ${new Date().toLocaleDateString()}`, 14, 49);

  autoTable(pdf, {
    startY: 55,
    head: [['Bill', 'Date', 'Items', 'Paid', 'Balance due']],
    body: rows.length ? rows : [['-', '-', 'No outstanding bills', '-', formatPriceMK(0)]],
    margin: { left: 14, right: 14 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [38, 50, 56] },
    columnStyles: {
      0: { cellWidth: 27 },
      1: { cellWidth: 25 },
      2: { cellWidth: 65 },
      3: { cellWidth: 27 },
      4: { cellWidth: 38 }
    }
  });

  let totalY = pdf.lastAutoTable.finalY + 10;
  if (totalY > pageHeight - 14) {
    pdf.addPage();
    totalY = 20;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(`TOTAL OUTSTANDING: ${formatPriceMK(outstanding)}`, pageWidth - 14, totalY, { align: 'right' });

  const qrSize = 30;
  let qrY = totalY + 12;
  const qrBlockHeight = 24 + qrSize;
  if (qrY + qrBlockHeight > pageHeight - 10) {
    pdf.addPage();
    qrY = 20;
  }
  const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'M'
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const websiteLink = 'www.smartbarmw.tech';
  const websiteLinkX = (pageWidth - pdf.getTextWidth(websiteLink)) / 2;
  pdf.textWithLink(websiteLink, websiteLinkX, qrY + 7, { url: APPLY_URL });
  pdf.text(qrDescription, pageWidth / 2, qrY + 14, { align: 'center' });
  pdf.text(qrCaption, pageWidth / 2, qrY + 20, { align: 'center' });
  pdf.addImage(qrCodeDataUrl, 'PNG', (pageWidth - qrSize) / 2, qrY + 24, qrSize, qrSize);

  return pdf.output('blob');
};

export const createCustomerStatementPrintHtml = (customer, businessName) => {
  const { outstanding, rows } = getStatementData(customer);
  const billSections = (rows.length ? rows : [['-', '-', 'No outstanding bills', '-', formatPriceMK(0)]])
    .map(([bill, date, items, paid, balanceDue]) => `
      <section class="bill">
        <div class="billHeader"><strong>${escapeHtml(bill)}</strong><span>${escapeHtml(date)}</span></div>
        <div class="items">${escapeHtml(items)}</div>
        <div class="amountRow"><span>Paid</span><span>${escapeHtml(paid)}</span></div>
        <div class="amountRow bold"><span>Balance due</span><span>${escapeHtml(balanceDue)}</span></div>
      </section>`)
    .join('');

  return `<!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Outstanding Statement - ${escapeHtml(customer.name || 'Customer')}</title>
        <style>
          @page { size: auto; margin: 5mm; }
          * { box-sizing: border-box; }
          html, body { width: 100%; margin: 0; padding: 0; }
          body { max-width: 70mm; margin: 0 auto; color: #111; font: 10px monospace; overflow-wrap: anywhere; }
          h1 { margin: 0 0 4px; font-size: 14px; text-align: center; }
          h2 { margin: 0 0 8px; font-size: 11px; text-align: center; }
          .details { margin: 3px 0; }
          .bill { padding: 5px 0; border-top: 1px dashed #777; break-inside: avoid; page-break-inside: avoid; }
          .billHeader, .amountRow { display: flex; justify-content: space-between; gap: 3mm; }
          .billHeader span, .amountRow span:last-child { text-align: right; }
          .items { margin: 4px 0; white-space: pre-line; }
          .amountRow { margin-top: 2px; }
          .bold { font-weight: bold; }
          .total { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #777; text-align: right; font-size: 12px; font-weight: bold; break-inside: avoid; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(businessName || 'SMART BAR')}</h1>
        <h2>Outstanding Balance Statement</h2>
        <p class="details"><strong>Customer:</strong> ${escapeHtml(customer.name || 'Customer')}</p>
        <p class="details"><strong>Phone:</strong> ${escapeHtml(customer.phone || '-')}</p>
        <p class="details"><strong>Statement date:</strong> ${new Date().toLocaleDateString()}</p>
        ${billSections}
        <p class="total">TOTAL OUTSTANDING: ${formatPriceMK(outstanding)}</p>
      </body>
    </html>`;
};