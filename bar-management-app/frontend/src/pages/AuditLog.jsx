import { useEffect, useMemo, useState } from 'react';
import PageContainer from './PageContainer';
import api from '../api/api';
import { formatPriceMK } from '../utils/formatPrice';

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', entityType: '', userId: '' });

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      try {
        const res = await api.get('/audit', { params: { limit: 200, ...filters } });
        setLogs(res.data || []);
      } catch (err) {
        console.error('Failed to load audit logs', err);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [filters]);

  const actionOptions = useMemo(() => Array.from(new Set((logs || []).map(l => l.action))).filter(Boolean), [logs]);
  const entityOptions = useMemo(() => Array.from(new Set((logs || []).map(l => l.entityType))).filter(Boolean), [logs]);

  return (
    <PageContainer title="🔒 Audit Log">
      <div style={styles.card}>
        <div style={styles.toolbar}>
          <div>
            <h3 style={styles.title}>Audit trail</h3>
            <p style={styles.subtitle}>Read-only record of sensitive actions for compliance and investigation.</p>
          </div>
          <div style={styles.filterRow}>
            <select value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} style={styles.select}>
              <option value="">All actions</option>
              {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filters.entityType} onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))} style={styles.select}>
              <option value="">All entities</option>
              {entityOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input placeholder="User ID" value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} style={styles.input} />
          </div>
        </div>

        {loading ? (
          <p>Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <p style={styles.empty}>No audit entries found.</p>
        ) : (
          <div style={styles.list}>
            {logs.map((entry) => (
              <div key={entry._id} style={styles.item}>
                <div style={styles.rowTop}>
                  <div style={styles.action}>{entry.action}</div>
                  <div style={styles.meta}>{new Date(entry.createdAt).toLocaleString()}</div>
                </div>
                <div style={styles.row}>
                  <div style={styles.meta}><strong>Entity:</strong> {entry.entityType} {entry.entityId ? `(${entry.entityId})` : ''}</div>
                  <div style={styles.meta}><strong>User:</strong> {entry.userId || entry.userRole}</div>
                </div>
                <div style={styles.details}>{entry.details ? JSON.stringify(entry.details) : '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

const styles = {
  card: { backgroundColor: 'white', borderRadius: 12, padding: 18 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { margin: 0, fontSize: 18 },
  subtitle: { margin: 0, color: '#666', fontSize: 13 },
  filterRow: { display: 'flex', gap: 8, alignItems: 'center' },
  select: { padding: 8, borderRadius: 8, border: '1px solid #eee' },
  input: { padding: 8, borderRadius: 8, border: '1px solid #eee' },
  list: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto' },
  item: { borderRadius: 8, padding: 12, backgroundColor: '#fafafa', border: '1px solid #f0f0f0' },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  meta: { color: '#444', fontSize: 13 },
  action: { fontWeight: 700 },
  details: { marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#333' },
  empty: { color: '#777' }
};

export default AuditLog;
