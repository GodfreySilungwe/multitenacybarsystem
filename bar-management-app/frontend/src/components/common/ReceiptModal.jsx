import { formatPriceMK } from '../../utils/formatPrice';

const ReceiptModal = ({ order, onClose }) => {
  if (!order) return null;

  const savedBusiness = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('businessSettings') || '{}');
      return parsed || {};
    } catch (error) {
      return {};
    }
  })();

  const customerName = order.customerName || order.customer?.name || order.customer?.fullName || 'Walk-in Customer';
  const customerAccount = order.customerAccount || (
    (order.customer?.accountUsername || order.customer?.username || order.customer?.accountUserId)
      ? {
          username: order.customer?.accountUsername || order.customer?.username || '',
          password: order.customer?.accountPassword || order.customer?.password || ''
        }
      : null
  );
  const shopName = savedBusiness.name || order.shopName || order.barName || 'SMART BAR';

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=420,height=720');

    if (!printWindow) {
      window.alert('Please allow pop-ups to print the receipt.');
      return;
    }

    const customerNotice = customerAccount
      ? `\nCustomer Portal: www.smartbarmw.tech\nUsername: ${customerAccount.username}\nPassword: ${customerAccount.password}\nPlease follow your bill accumulation by logging in with the details above.`
      : '';

    const receiptMarkup = `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Receipt ${order.orderNumber}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; }
            body {
              font-family: monospace;
              font-size: 11px;
              color: #111;
              width: 80mm;
              box-sizing: border-box;
              padding: 8px;
            }
            .receipt { width: 100%; }
            .center { text-align: center; }
            .divider { border-top: 1px dashed #444; margin: 6px 0; }
            .bold { font-weight: 700; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { padding: 2px 0; vertical-align: top; }
            th { text-align: left; font-size: 10px; text-transform: uppercase; }
            .qty, .price, .subtotal { text-align: right; }
            .totals { margin-top: 6px; }
            .row { display: flex; justify-content: space-between; gap: 8px; }
            .footer { text-align: center; margin-top: 6px; }
            .notice { margin-top: 8px; white-space: pre-line; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <div class="bold">${shopName}</div>
            </div>
            <div class="divider"></div>
            <div>Order #: ${order.orderNumber}</div>
            <div>Date: ${new Date(order.createdAt).toLocaleString()}</div>
            <div>Customer: ${customerName}</div>
            <div class="divider"></div>
            <table>
              <thead>
                <tr>
                  <th style="width:40%;">Item</th>
                  <th style="width:12%;" class="qty">Qty</th>
                  <th style="width:24%;" class="price">Price</th>
                  <th style="width:24%;" class="subtotal">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${order.items.map((item) => `
                  <tr>
                    <td>${item.productName || item.product?.name || 'Product'}</td>
                    <td class="qty">${item.quantity}</td>
                    <td class="price">${formatPriceMK(item.priceAtSale)}</td>
                    <td class="subtotal">${formatPriceMK(item.subtotal)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="divider"></div>
            <div class="totals">
              <div class="row"><span>Subtotal:</span><span>${formatPriceMK(order.totalAmount)}</span></div>
              <div class="row bold"><span>TOTAL:</span><span>${formatPriceMK(order.totalAmount)}</span></div>
            </div>
            <div class="divider"></div>
            <div class="footer">
              <div class="bold">Thank you for your business!</div>
              <div>Visit us again 😊</div>
              ${customerAccount ? `<div class="notice">
                <div class="bold">Customer Login Details</div>
                <div>Username: ${customerAccount.username}</div>
                <div>Password: ${customerAccount.password}</div>
                <div>Follow bill accumulation at www.smartbarmw.tech using the credentials above.</div>
              </div>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(receiptMarkup);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>

        <div id="receipt" style={styles.receipt}>
          <div style={styles.header}>
            <h1 style={styles.barName}>{shopName}</h1>
            <div style={styles.divider} />
          </div>

          <div style={styles.receiptInfo}>
            <p><strong>Order #:</strong> {order.orderNumber}</p>
            <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleString()}</p>
            <p><strong>Customer:</strong> {customerName}</p>
          </div>
          <div style={styles.divider} />

          <table style={styles.itemsTable}>
            <thead>
              <tr>
                <th style={styles.thItem}>ITEM</th>
                <th style={styles.thQty}>QTY</th>
                <th style={styles.thPrice}>PRICE</th>
                <th style={styles.thSubtotal}>SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={index}>
                  <td style={styles.tdItem}>{item.productName || item.product?.name || 'Product'}</td>
                  <td style={styles.tdQty}>{item.quantity}</td>
                  <td style={styles.tdPrice}>{formatPriceMK(item.priceAtSale)}</td>
                  <td style={styles.tdSubtotal}>{formatPriceMK(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.divider} />

          <div style={styles.totals}>
            <div style={styles.totalRow}>
              <span>Subtotal:</span>
              <span>{formatPriceMK(order.totalAmount)}</span>
            </div>
            <div style={styles.totalRowBig}>
              <span><strong>TOTAL:</strong></span>
              <span style={styles.totalAmount}>{formatPriceMK(order.totalAmount)}</span>
            </div>
          </div>

          <div style={styles.divider} />

          <div style={styles.footer}>
            <p style={styles.thankYou}>Thank you for your business!</p>
            <p style={styles.footerText}>Visit us again 😊</p>
            {customerAccount && (
              <div style={styles.customerAccountBlock}>
                <p style={styles.customerAccountTitle}>Customer Login Details</p>
                <p style={styles.footerText}>Username: {customerAccount.username}</p>
                <p style={styles.footerText}>Password: {customerAccount.password}</p>
                <p style={styles.footerText}>Please follow bill accumulation by logging in on www.smartbarmw.tech using the credentials above.</p>
              </div>
            )}
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.printBtn} onClick={handlePrint}>
            🖨️ Print Receipt
          </button>
          <button style={styles.closeBtnModal} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px'
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '16px',
    maxWidth: '400px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '24px',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  closeBtn: {
    position: 'absolute',
    top: '12px',
    right: '16px',
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#888',
    zIndex: 10
  },
  receipt: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#333',
    padding: '10px 0',
    width: '100%',
    maxWidth: '360px',
    margin: '0 auto',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  header: {
    textAlign: 'center',
    marginBottom: '15px'
  },
  barName: {
    fontSize: '24px',
    margin: '0 0 5px 0',
    color: '#e94560'
  },
  address: {
    margin: '2px 0',
    fontSize: '12px',
    color: '#666'
  },
  phone: {
    margin: '2px 0',
    fontSize: '12px',
    color: '#666'
  },
  receiptInfo: {
    marginBottom: '10px',
    fontSize: '13px',
    lineHeight: '1.6'
  },
  divider: {
    borderTop: '1px dashed #ccc',
    margin: '10px 0'
  },
  itemsTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '10px',
    fontSize: '13px',
    tableLayout: 'fixed'
  },
  // Header styles - FIXED
  thItem: {
    textAlign: 'left',
    padding: '4px 0',
    borderBottom: '1px solid #ddd',
    fontSize: '12px',
    textTransform: 'uppercase',
    color: '#666',
    width: '40%'
  },
  thQty: {
    textAlign: 'center',
    padding: '4px 0',
    borderBottom: '1px solid #ddd',
    fontSize: '12px',
    textTransform: 'uppercase',
    color: '#666',
    width: '15%'
  },
  thPrice: {
    textAlign: 'right',
    padding: '4px 0',
    borderBottom: '1px solid #ddd',
    fontSize: '12px',
    textTransform: 'uppercase',
    color: '#666',
    width: '25%'
  },
  thSubtotal: {
    textAlign: 'right',
    padding: '4px 0',
    borderBottom: '1px solid #ddd',
    fontSize: '12px',
    textTransform: 'uppercase',
    color: '#666',
    width: '20%'
  },
  // Row styles - FIXED
  tdItem: {
    padding: '4px 0',
    borderBottom: '1px solid #f0f0f0',
    textAlign: 'left',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  tdQty: {
    padding: '4px 0',
    borderBottom: '1px solid #f0f0f0',
    textAlign: 'center'
  },
  tdPrice: {
    padding: '4px 0',
    borderBottom: '1px solid #f0f0f0',
    textAlign: 'right'
  },
  tdSubtotal: {
    padding: '4px 0',
    borderBottom: '1px solid #f0f0f0',
    textAlign: 'right'
  },
  totals: {
    marginTop: '10px'
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '13px'
  },
  totalRowBig: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '18px',
    borderTop: '2px solid #333'
  },
  totalAmount: {
    fontWeight: 'bold',
    color: '#e94560'
  },
  footer: {
    textAlign: 'center',
    marginTop: '15px'
  },
  thankYou: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1a1a2e',
    margin: '0 0 5px 0'
  },
  footerText: {
    fontSize: '12px',
    color: '#888',
    margin: '2px 0'
  },
  customerAccountBlock: {
    marginTop: '10px',
    padding: '8px',
    border: '1px dashed #e94560',
    borderRadius: '8px',
    backgroundColor: '#fff7f8'
  },
  customerAccountTitle: {
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#e94560',
    margin: '0 0 6px 0'
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #eee'
  },
  printBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2ecc71',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  closeBtnModal: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    color: '#333',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  }
};

export default ReceiptModal;