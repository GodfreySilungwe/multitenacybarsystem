import { useEffect, useState } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';
import { confirmTypedDelete } from '../utils/confirmation';

const Bars = () => {
  const [bars, setBars] = useState([]);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    adminUsername: '',
    adminEmail: '',
    adminPassword: '',
    adminFullName: '',
    adminPhone: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingApplications, setPendingApplications] = useState(0);

  useEffect(() => {
    loadBars();
    loadPendingApplicationCount();
  }, []);

  const loadBars = async () => {
    try {
      const res = await api.get('/bars');
      setBars(res.data || []);
    } catch (err) {
      console.error('Error loading bars:', err);
      setError(err.response?.data?.message || 'Failed to load bars');
    }
  };

  const handleResetOwnerPassword = async (barId) => {
    const newPassword = window.prompt('Enter a new password for this bar owner account (minimum 6 characters):');
    if (!newPassword) {
      return;
    }

    if (newPassword.length < 6) {
      setError('❌ Password must be at least 6 characters');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      const response = await api.patch(`/bars/${barId}/reset-owner-password`, { newPassword });
      setMessage(`✅ Bar owner password reset successfully. New password: ${response.data?.password || newPassword}`);
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      console.error('Error resetting bar owner password:', err);
      setError(err.response?.data?.message || '❌ Failed to reset bar owner password');
      setTimeout(() => setError(''), 4000);
    }
  };

  const updateBarStatus = async (barId, status) => {
    try {
      const confirmMessage =
        status === 'suspended'
          ? 'Suspend this bar? It will no longer be active.'
          : status === 'deleted'
            ? 'Delete this bar? This will mark it as deleted and remove access.'
            : 'Restore this bar? It will become active again.';

      if (status === 'deleted') {
        if (!confirmTypedDelete('delete this bar and remove access')) {
          return;
        }
      } else if (!window.confirm(confirmMessage)) {
        return;
      }

      await api.patch(`/bars/${barId}/status`, { status });
      await loadBars();
      setMessage(`Bar status updated to ${status}.`);
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      console.error('Error updating bar status:', err);
      setError(err.response?.data?.message || 'Failed to update bar status');
      setTimeout(() => setError(''), 6000);
    }
  };

  const loadPendingApplicationCount = async () => {
    try {
      const res = await api.get('/bar-applications');
      const apps = res.data || [];
      setPendingApplications(apps.filter((application) => application.status === 'pending').length);
    } catch (err) {
      console.error('Error loading application count:', err);
    }
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const sanitized = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim(),
        adminUsername: form.adminUsername.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
        adminFullName: form.adminFullName.trim(),
        adminPhone: form.adminPhone.trim()
      };

      const res = await api.post('/bars', sanitized);
      setBars((prev) => [res.data.bar, ...prev]);
      setForm({
        name: '',
        code: '',
        description: '',
        adminUsername: '',
        adminEmail: '',
        adminPassword: '',
        adminFullName: '',
        adminPhone: ''
      });
      setMessage(`Bar created successfully. Admin username: ${res.data.adminCredentials.username}`);
    } catch (err) {
      console.error('Error creating bar:', err);
      setError(err.response?.data?.message || 'Failed to create bar');
    } finally {
      setLoading(false);
      window.setTimeout(() => setMessage(''), 8000);
    }
  };

  return (
    <PageContainer title="🏢 Bars Management">
      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.topInfo}>
        <div style={styles.pendingBadge}>
          Pending applications: {pendingApplications}
        </div>
        <a href="/bar-applications" style={styles.linkButton}>
          Review Applications
        </a>
      </div>

      <UnifiedCard title="Create New Bar">
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.grid}>
            <label style={styles.label}>Bar Name</label>
            <input
              style={styles.input}
              name="name"
              value={form.name}
              onChange={handleChange}
              required
            />
            <label style={styles.label}>Bar Code</label>
            <input
              style={styles.input}
              name="code"
              value={form.code}
              onChange={handleChange}
            />
            <label style={styles.label}>Description</label>
            <textarea
              style={{ ...styles.input, minHeight: '80px' }}
              name="description"
              value={form.description}
              onChange={handleChange}
            />
            <label style={styles.label}>Admin Username</label>
            <input
              style={styles.input}
              name="adminUsername"
              value={form.adminUsername}
              onChange={handleChange}
              required
            />
            <label style={styles.label}>Admin Email</label>
            <input
              style={styles.input}
              name="adminEmail"
              value={form.adminEmail}
              onChange={handleChange}
              required
            />
            <label style={styles.label}>Admin Password</label>
            <input
              type="password"
              style={styles.input}
              name="adminPassword"
              value={form.adminPassword}
              onChange={handleChange}
              required
            />
            <label style={styles.label}>Admin Full Name</label>
            <input
              style={styles.input}
              name="adminFullName"
              value={form.adminFullName}
              onChange={handleChange}
            />
            <label style={styles.label}>Admin Phone</label>
            <input
              style={styles.input}
              name="adminPhone"
              value={form.adminPhone}
              onChange={handleChange}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating bar...' : 'Create Bar'}
          </Button>
        </form>
      </UnifiedCard>

      <UnifiedCard title="Existing Bars">
        {bars.length === 0 ? (
          <p style={styles.empty}>No bars available yet.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Owner Email</th>
                  <th>Registered</th>
                  <th>Code</th>
                  <th>Sales Accounts</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bars.map((bar) => (
                  <tr key={bar._id || bar.id}>
                    <td>{bar.name}</td>
                    <td>{bar.owner?.fullName || bar.owner?.username || '-'}</td>
                    <td>{bar.owner?.email || '-'}</td>
                    <td>{bar.createdAt ? new Date(bar.createdAt).toLocaleDateString() : '-'}</td>
                    <td>{bar.code || '-'}</td>
                    <td>{bar.activeSalesAccounts ?? 0}</td>
                    <td>{bar.description || '-'}</td>
                    <td>
                      <span style={{
                        ...styles.statusBadge,
                        ...(bar.status === 'active' ? styles.statusActive : bar.status === 'suspended' ? styles.statusSuspended : styles.statusDeleted)
                      }}>
                        {bar.status || 'active'}
                      </span>
                    </td>
                    <td>
                      <div style={styles.actionStack}>
                        <button
                          type="button"
                          style={styles.resetButton}
                          onClick={() => handleResetOwnerPassword(bar._id)}
                        >
                          Reset Owner Password
                        </button>
                        {bar.status !== 'deleted' && (
                          <>
                            <button
                              type="button"
                              style={styles.suspendButton}
                              disabled={bar.status === 'suspended'}
                              onClick={() => updateBarStatus(bar._id, 'suspended')}
                            >
                              Suspend
                            </button>
                            <button
                              type="button"
                              style={styles.deleteButton}
                              onClick={() => updateBarStatus(bar._id, 'deleted')}
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {bar.status !== 'active' && (
                          <button
                            type="button"
                            style={styles.restoreButton}
                            onClick={() => updateBarStatus(bar._id, 'active')}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </UnifiedCard>
    </PageContainer>
  );
};

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  },
  label: {
    display: 'block',
    fontWeight: 600,
    marginBottom: '6px',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid #ddd',
    fontSize: '14px'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  empty: {
    padding: '20px',
    color: '#666'
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '84px',
    padding: '5px 10px',
    borderRadius: '999px',
    fontWeight: '700',
    textTransform: 'capitalize',
    fontSize: '12px'
  },
  statusActive: {
    backgroundColor: '#e8f8ef',
    color: '#1d7a4a'
  },
  statusSuspended: {
    backgroundColor: '#fff4e5',
    color: '#b45c00'
  },
  statusDeleted: {
    backgroundColor: '#fde2e2',
    color: '#991b1b'
  },
  actionButton: {
    minWidth: '96px',
    marginRight: '8px',
    borderRadius: '8px',
    border: '1px solid transparent',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  actionStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'flex-start'
  },
  resetButton: {
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    borderColor: '#818cf8',
    borderRadius: '8px',
    border: '1px solid transparent',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  suspendButton: {
    backgroundColor: '#fef3c7',
    color: '#b45309',
    borderColor: '#fbbf24'
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderColor: '#f87171'
  },
  restoreButton: {
    backgroundColor: '#d1fae5',
    color: '#166534',
    borderColor: '#34d399'
  },
  success: {
    backgroundColor: '#e8f8ef',
    color: '#1d7a4a',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '16px'
  },
  topInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  pendingBadge: {
    padding: '10px 16px',
    backgroundColor: '#f0f7ff',
    borderRadius: '999px',
    color: '#1d4ed8',
    fontWeight: '700'
  },
  linkButton: {
    padding: '10px 18px',
    borderRadius: '999px',
    textDecoration: 'none',
    backgroundColor: '#1f2937',
    color: 'white',
    fontWeight: '700'
  },
  error: {
    backgroundColor: '#fde2e2',
    color: '#a12a2a',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '16px'
  }
};

export default Bars;
