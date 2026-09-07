import { useEffect, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import PageContainer from './PageContainer';
import { formatPriceMK } from '../utils/formatPrice';

const emptyEntry = { type: 'cash_out', amount: '', description: '' };

const CashChest = () => {
  const { user } = useAuth();
  const canManage = ['owner', 'manager'].includes(user?.role);
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [entry, setEntry] = useState(emptyEntry);
  const [countedCash, setCountedCash] = useState('');
  const [closingNote, setClosingNote] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [currentResponse, dashboardResponse] = await Promise.all([
        api.get('/cash-chest/current'),
        api.get('/orders/summary', { params: { range: 'today', optimized: 'true' } })
      ]);
      setSession(currentResponse.data?.session || null);
      setDashboardSummary(dashboardResponse.data || {});
      if (canManage) {
        const historyResponse = await api.get('/cash-chest/history');
        setHistory(historyResponse.data?.sessions || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the cash chest.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [canManage]);

  const runAction = async (action, successMessage) => {
    try {
      setError('');
      setMessage('');
      await action();
      setMessage(successMessage);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Cash chest action failed.');
    }
  };

  const openSession = async (event) => {
    event.preventDefault();
    await runAction(
      () => api.post('/cash-chest/open', { openingFloat: Number(openingFloat), note: openingNote }),
      'Cash chest opened.'
    );
    setOpeningFloat('');
    setOpeningNote('');
  };

  const addEntry = async (event) => {
    event.preventDefault();
    await runAction(
      () => api.post('/cash-chest/entries', { ...entry, amount: Number(entry.amount) }),
      `${entry.type === 'cash_out' ? 'Cash out' : 'Cash in'} recorded.`
    );
    setEntry(emptyEntry);
  };

  const closeSession = async (event) => {
    event.preventDefault();
    await runAction(
      () => api.post('/cash-chest/close', { countedCash: Number(countedCash), note: closingNote }),
      'Cash chest closed.'
    );
    setCountedCash('');
    setClosingNote('');
  };

  const summary = session?.summary;
  const cashReceivedDisplay = dashboardSummary.expectedHandover ?? summary?.cashIn ?? 0;
  const posCashSalesDisplay = dashboardSummary.directSales ?? summary?.cashSales ?? 0;

  if (loading) {
    return <PageContainer title="Cash Chest"><p>Loading cash chest...</p></PageContainer>;
  }

  return (
    <PageContainer title="Cash Chest">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Cash Chest</h2>
          <p style={styles.subtitle}>Reconcile physical cash against recorded receipts and withdrawals.</p>
        </div>
        {session && <span style={styles.openBadge}>OPEN</span>}
      </div>

      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      {!session ? (
        canManage ? (
          <section style={styles.card}>
            <h3 style={styles.sectionTitle}>Open a cash session</h3>
            <form onSubmit={openSession} style={styles.form}>
              <label style={styles.label}>
                Opening float (MK)
                <input required min="0" type="number" step="0.01" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} style={styles.input} />
              </label>
              <label style={styles.label}>
                Note
                <input type="text" value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} style={styles.input} placeholder="Optional opening note" />
              </label>
              <button type="submit" style={styles.primaryButton}>Open Cash Chest</button>
            </form>
          </section>
        ) : (
          <div style={styles.empty}>No cash chest session is currently open.</div>
        )
      ) : (
        <>
          <div style={styles.summaryGrid}>
            <Summary label="Opening float" value={summary.openingFloat} />
            <Summary label="Cash received" value={cashReceivedDisplay} />
            <Summary label="Cash removed" value={summary.cashOut} />
            <Summary label="Expected cash" value={summary.expectedCash} emphasis />
            {summary.countedCash !== null && <Summary label="Counted cash" value={summary.countedCash} />}
            {summary.variance !== null && <Summary label="Variance" value={summary.variance} emphasis={summary.variance !== 0} />}
          </div>

          <div style={styles.sourceGrid}>
            <Source label="POS DIRECT SALES" value={posCashSalesDisplay} />
            <Source label="Initial cash on credit" value={summary.initialCreditCash} />
            <Source label="Bill settlements" value={summary.cashSettlements} />
            <Source label="Manual cash in" value={summary.manualCashIn} />
          </div>

          {canManage && (
            <div style={styles.actionGrid}>
              <section style={styles.card}>
                <h3 style={styles.sectionTitle}>Record cash movement</h3>
                <form onSubmit={addEntry} style={styles.form}>
                  <label style={styles.label}>
                    Type
                    <select value={entry.type} onChange={(event) => setEntry({ ...entry, type: event.target.value })} style={styles.input}>
                      <option value="cash_out">Cash out</option>
                      <option value="cash_in">Cash in</option>
                    </select>
                  </label>
                  <label style={styles.label}>
                    Amount (MK)
                    <input required min="0.01" type="number" step="0.01" value={entry.amount} onChange={(event) => setEntry({ ...entry, amount: event.target.value })} style={styles.input} />
                  </label>
                  <label style={styles.label}>
                    Reason
                    <input required type="text" value={entry.description} onChange={(event) => setEntry({ ...entry, description: event.target.value })} style={styles.input} placeholder="Supplier payment, safe transfer..." />
                  </label>
                  <button type="submit" style={styles.secondaryButton}>Record Movement</button>
                </form>
              </section>

              <section style={styles.card}>
                <h3 style={styles.sectionTitle}>Close cash session</h3>
                <form onSubmit={closeSession} style={styles.form}>
                  <label style={styles.label}>
                    Physically counted cash (MK)
                    <input required min="0" type="number" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} style={styles.input} />
                  </label>
                  <label style={styles.label}>
                    Closing note
                    <input type="text" value={closingNote} onChange={(event) => setClosingNote(event.target.value)} style={styles.input} placeholder="Explain any difference" />
                  </label>
                  <button type="submit" style={styles.dangerButton}>Close Cash Chest</button>
                </form>
              </section>
            </div>
          )}

          <section style={styles.card}>
            <h3 style={styles.sectionTitle}>Manual movements</h3>
            {summary.entries.length === 0 ? <p style={styles.muted}>No manual movements recorded.</p> : (
              <div style={styles.list}>
                {summary.entries.map((item) => (
                  <div key={item._id} style={styles.listRow}>
                    <span>{item.description}<small style={styles.small}> {item.recordedByName || ''}</small></span>
                    <strong style={{ color: item.type === 'cash_out' ? '#c0392b' : '#16803c' }}>{item.type === 'cash_out' ? '-' : '+'}{formatPriceMK(item.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {canManage && history.length > 0 && (
        <section style={styles.card}>
          <h3 style={styles.sectionTitle}>Recent closed sessions</h3>
          <div style={styles.list}>
            {history.filter((item) => item.status === 'closed').map((item) => (
              <div key={item._id} style={styles.listRow}>
                <span>{new Date(item.openedAt).toLocaleString()}<small style={styles.small}> closed by {item.closedByName || 'User'}</small></span>
                <strong style={{ color: item.variance === 0 ? '#16803c' : '#c0392b' }}>{formatPriceMK(item.variance)} variance</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
};

const Summary = ({ label, value, emphasis = false }) => (
  <div style={{ ...styles.summaryCard, ...(emphasis ? styles.summaryEmphasis : {}) }}>
    <span style={styles.summaryLabel}>{label}</span>
    <strong style={styles.summaryValue}>{formatPriceMK(value)}</strong>
  </div>
);

const Source = ({ label, value }) => (
  <div style={styles.sourceRow}><span>{label}</span><strong>{formatPriceMK(value)}</strong></div>
);

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' },
  title: { margin: 0, color: '#1a1a2e' },
  subtitle: { margin: '6px 0 0', color: '#777' },
  openBadge: { backgroundColor: '#e9f8ef', color: '#16803c', padding: '6px 10px', borderRadius: '6px', fontWeight: '700', fontSize: '12px' },
  card: { backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '20px', marginBottom: '18px' },
  sectionTitle: { margin: '0 0 16px', color: '#1a1a2e', fontSize: '18px' },
  form: { display: 'grid', gap: '12px' },
  label: { display: 'grid', gap: '6px', color: '#444', fontSize: '14px', fontWeight: '600' },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  primaryButton: { padding: '11px 16px', border: 0, borderRadius: '6px', backgroundColor: '#e94560', color: '#fff', fontWeight: '700', cursor: 'pointer' },
  secondaryButton: { padding: '11px 16px', border: 0, borderRadius: '6px', backgroundColor: '#1a1a2e', color: '#fff', fontWeight: '700', cursor: 'pointer' },
  dangerButton: { padding: '11px 16px', border: 0, borderRadius: '6px', backgroundColor: '#c0392b', color: '#fff', fontWeight: '700', cursor: 'pointer' },
  success: { padding: '12px 14px', marginBottom: '16px', backgroundColor: '#e9f8ef', color: '#16803c', borderRadius: '6px' },
  error: { padding: '12px 14px', marginBottom: '16px', backgroundColor: '#fdecec', color: '#a93226', borderRadius: '6px' },
  empty: { padding: '28px', backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '10px', color: '#777', textAlign: 'center' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' },
  summaryCard: { backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '15px', display: 'grid', gap: '8px' },
  summaryEmphasis: { borderColor: '#e94560' },
  summaryLabel: { color: '#777', fontSize: '13px' },
  summaryValue: { color: '#1a1a2e', fontSize: '19px' },
  sourceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '18px' },
  sourceRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', backgroundColor: '#f8f9fa', borderRadius: '6px', color: '#555', fontSize: '13px' },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' },
  list: { display: 'grid', gap: '10px' },
  listRow: { display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '10px 0', borderBottom: '1px solid #f0f0f0', color: '#444' },
  small: { display: 'block', color: '#999', fontSize: '11px', marginTop: '3px' },
  muted: { color: '#777', margin: 0 }
};

export default CashChest;
