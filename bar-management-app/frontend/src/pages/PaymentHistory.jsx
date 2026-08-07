import { useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import PageContainer from './PageContainer';
import { formatPriceMK } from '../utils/formatPrice';

const paymentTypeOptions = [
  { value: 'all', label: 'All payments' },
  { value: 'credit_payment', label: 'Credit payments' },
  { value: 'customer_bill_payment', label: 'Customer bill settlements' },
  { value: 'pos_payment', label: 'POS payments' }
];

const PaymentHistory = () => {
  const [settlements, setSettlements] = useState([]);
  const [filter, setFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const canReverseSettlements = user?.role === 'owner' && Boolean(user?.barId);
  const PAGE_SIZE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, customerFilter, settlements]);

  useEffect(() => {
    const loadSettlements = async () => {
      try {
        const res = await api.get('/customer-order-requests/settlements');
        setSettlements(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load settlements', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettlements();
  }, []);

  const customerOptions = useMemo(() => {
    const names = new Set((settlements || []).map((entry) => entry.customerName || 'Walk-in customer'));
    return Array.from(names).sort();
  }, [settlements]);

  const filteredSettlements = useMemo(() => {
    return (settlements || [])
      .filter((entry) => entry.status !== 'reversed')
      .filter((entry) => {
        const matchesType = filter === 'all' ? true : entry.settlementType === filter;
        const matchesCustomer = customerFilter === 'all' ? true : (entry.customerName || 'Walk-in customer') === customerFilter;
        return matchesType && matchesCustomer;
      });
  }, [customerFilter, filter, settlements]);

  const totalPages = Math.max(1, Math.ceil(filteredSettlements.length / PAGE_SIZE));
  const paginatedSettlements = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredSettlements.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredSettlements]);

  const summaryCards = useMemo(() => {
    const totals = {
      credit_payment: 0,
      customer_bill_payment: 0,
      pos_payment: 0
    };

    (filteredSettlements || []).forEach((entry) => {
      const type = entry.settlementType || 'credit_payment';
      if (totals[type] !== undefined) {
        totals[type] += Number(entry.amount || 0);
      }
    });

    return [
      { label: 'Credit payments', value: totals.credit_payment, color: '#e94560' },
      { label: 'Customer settlements', value: totals.customer_bill_payment, color: '#3498db' },
      { label: 'POS payments', value: totals.pos_payment, color: '#2ecc71' }
    ];
  }, [filteredSettlements]);

  const handleReverseSettlement = async (entry) => {
    if (!window.confirm('Reverse this settlement record?')) return;

    try {
      const res = await api.patch(`/customer-order-requests/settlements/${entry._id}/reverse`, { reason: 'Manager reversal' });
      setSettlements((prev) => prev.map((item) => (item._id === entry._id ? res.data : item)));
      window.dispatchEvent(new Event('payment-updated'));
    } catch (err) {
      console.error('Failed to reverse settlement', err);
      alert(err.response?.data?.message || 'Failed to reverse settlement');
    }
  };

  const handleExport = () => {
    const rows = filteredSettlements.map((entry) => ({
      customer: entry.customerName || 'Walk-in customer',
      amount: Number(entry.amount || 0),
      paymentMethod: entry.paymentMethod || 'cash',
      paymentType: entry.settlementType || 'credit_payment',
      reference: entry.paymentReference || '—',
      approvedBy: entry.approvedBy || '—',
      date: entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'
    }));

    const csv = [
      ['Customer', 'Amount', 'Payment Method', 'Payment Type', 'Reference', 'Approved By', 'Date'],
      ...rows.map((row) => [row.customer, row.amount, row.paymentMethod, row.paymentType, row.reference, row.approvedBy, row.date])
    ]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, 'payment-history.csv');
  };

  return (
    <PageContainer title="💳 Payment History">
      <div style={styles.card}>
        <div style={styles.toolbar}>
          <div>
            <h3 style={styles.title}>Settlement history</h3>
            <p style={styles.subtitle}>Track all payments, approvals and references in one place.</p>
          </div>
          <div style={styles.filterRow}>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={styles.select}>
              {paymentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} style={styles.select}>
              <option value="all">All customers</option>
              {customerOptions.map((customer) => (
                <option key={customer} value={customer}>{customer}</option>
              ))}
            </select>
            <button type="button" onClick={handleExport} style={styles.exportBtn}>Export Excel</button>
          </div>
        </div>

        <div style={styles.summaryGrid}>
          {summaryCards.map((card) => (
            <div key={card.label} style={{ ...styles.summaryCard, borderColor: card.color }}>
              <div style={{ ...styles.summaryDot, backgroundColor: card.color }} />
              <div>
                <div style={styles.summaryLabel}>{card.label}</div>
                <div style={styles.summaryValue}>{formatPriceMK(card.value)}</div>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <p>Loading payments...</p>
        ) : filteredSettlements.length === 0 ? (
          <p style={styles.empty}>No settlement records found.</p>
        ) : (
          <>
            <div style={styles.list}>
              {paginatedSettlements.map((entry) => (
                <div key={entry._id} style={styles.item}>
                  <div style={styles.row}>
                    <div>
                      <div style={styles.customerName}>{entry.customerName || 'Walk-in customer'}</div>
                      <div style={styles.meta}>Method: {entry.paymentMethod || 'cash'}</div>
                    </div>
                    <div style={styles.amount}>{formatPriceMK(entry.amount || 0)}</div>
                  </div>
                  <div style={styles.row}>
                    <div style={styles.meta}>Type: {entry.settlementType || 'payment'}</div>
                    <div style={styles.meta}>Processed by: {entry.processedBy || entry.approvedBy || '—'}</div>
                  </div>
                  <div style={styles.row}>
                    <div style={styles.meta}>{entry.paymentReference || 'No reference provided'}</div>
                    <div style={styles.meta}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}</div>
                  </div>
                  {canReverseSettlements && (
                    <div style={styles.row}>
                      <button type="button" onClick={() => handleReverseSettlement(entry)} style={styles.reverseBtn}>Reverse payment</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={styles.pagination}>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  ...styles.pageBtn,
                  ...(currentPage === 1 ? styles.pageBtnDisabled : {})
                }}
              >
                Previous
              </button>
              <span style={styles.pageInfo}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  ...styles.pageBtn,
                  ...(currentPage === totalPages ? styles.pageBtnDisabled : {})
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
};

const styles = {
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '18px',
    color: '#111827'
  },
  subtitle: {
    margin: 0,
    color: '#6b7280',
    fontSize: '13px'
  },
  filterRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  select: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    minWidth: '220px'
  },
  exportBtn: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    fontWeight: '700',
    cursor: 'pointer'
  },
  reverseBtn: {
    padding: '8px 12px',
    borderRadius: '10px',
    border: '1px solid #f59e0b',
    backgroundColor: '#fff7ed',
    color: '#b45309',
    fontWeight: '700',
    cursor: 'pointer'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginBottom: '16px'
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#fafafa'
  },
  summaryDot: {
    width: '10px',
    height: '10px',
    borderRadius: '999px'
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#6b7280'
  },
  summaryValue: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#111827'
  },
  empty: {
    color: '#6b7280',
    margin: 0
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  item: {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '12px 14px',
    backgroundColor: '#fafafa'
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '6px'
  },
  customerName: {
    fontWeight: '700',
    color: '#111827'
  },
  meta: {
    fontSize: '13px',
    color: '#6b7280'
  },
  amount: {
    fontWeight: '700',
    color: '#e94560'
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginTop: '18px'
  },
  pageBtn: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#111827',
    cursor: 'pointer',
    fontWeight: '700'
  },
  pageBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  pageInfo: {
    fontWeight: '700',
    color: '#111827'
  }
};

export default PaymentHistory;
