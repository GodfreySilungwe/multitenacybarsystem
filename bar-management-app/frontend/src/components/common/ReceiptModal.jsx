import { formatPriceMK } from '../../utils/formatPrice';

const ReceiptModal = ({ order, onClose }) => {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
        
        <div id="receipt" style={styles.receipt}>
          {/* Header */}
          <div style={styles.header}>
            <h1 style={styles.barName}>🍹 SMART BAR</h1>
            <div style={styles.divider} />
          </div>

          {/* Receipt Info */}
          <div style={styles.receiptInfo}>
            <p><strong>Order #:</strong> {order.orderNumber}</p>
            <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleString()}</p>
            <p><strong>Customer:</strong> {order.customerName || order.customer?.name || 'Walk-in Customer'}</p>
          </div>
          <div style={styles.divider} />

          {/* Items - FIXED COLUMN ALIGNMENT */}
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

          {/* Totals */}
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

          {/* Footer */}
          <div style={styles.footer}>
            <p style={styles.thankYou}>Thank you for your business!</p>
            <p style={styles.footerText}>Visit us again 😊</p>
            <p style={styles.footerText}>Follow us on Facebook: @SMARTBAR</p>
          </div>
        </div>

        {/* Buttons */}
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
    fontSize: '14px',
    color: '#333',
    padding: '10px 0'
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
    fontSize: '13px'
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
    textAlign: 'left'
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