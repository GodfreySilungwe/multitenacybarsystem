import { useEffect, useMemo, useState } from 'react';
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
    confirmAdminPassword: '',
    adminFullName: '',
    adminPhone: '',
    adminRole: 'owner'
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingApplications, setPendingApplications] = useState(0);
  const [search, setSearch] = useState('');

  const filteredBars = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return bars;
    }

    return bars.filter((bar) => {
      const haystack = [
        bar.name,
        bar.code,
        bar.description,
        bar.owner?.fullName,
        bar.owner?.username,
        bar.owner?.email,
        bar.owner?.phone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [bars, search]);

  const barStats = useMemo(() => {
    const total = bars.length;
    const active = bars.filter((bar) => (bar.status || 'active') === 'active').length;
    const suspended = bars.filter((bar) => bar.status === 'suspended').length;
    const ownerContacts = bars.filter((bar) => bar.owner?.email || bar.owner?.phone).length;

    return { total, active, suspended, ownerContacts };
  }, [bars]);

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
      if (form.adminPassword !== form.confirmAdminPassword) {
        setError('❌ Passwords do not match');
        setLoading(false);
        return;
      }

      const sanitized = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim(),
        adminUsername: form.adminUsername.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
        confirmAdminPassword: form.confirmAdminPassword,
        adminFullName: form.adminFullName.trim(),
        adminPhone: form.adminPhone.trim(),
        adminRole: form.adminRole || 'owner'
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
        confirmAdminPassword: '',
        adminFullName: '',
        adminPhone: '',
        adminRole: 'owner'
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
            <label style={styles.label}>Owner Full Name</label>
            <input
              style={styles.input}
              name="adminFullName"
              value={form.adminFullName}
              onChange={handleChange}
              placeholder="Enter owner full name"
            />
            <label style={styles.label}>Owner Username</label>
            <input
              style={styles.input}
              name="adminUsername"
              value={form.adminUsername}
              onChange={handleChange}
              placeholder="Choose a username"
              required
            />
            <label style={styles.label}>Owner Email</label>
            <input
              type="email"
              style={styles.input}
              name="adminEmail"
              value={form.adminEmail}
              onChange={handleChange}
              placeholder="Enter owner email"
              required
            />
            <label style={styles.label}>Owner Password</label>
            <input
              type="password"
              style={styles.input}
              name="adminPassword"
              value={form.adminPassword}
              onChange={handleChange}
              placeholder="Minimum 6 characters"
              required
            />
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              style={styles.input}
              name="confirmAdminPassword"
              value={form.confirmAdminPassword}
              onChange={handleChange}
              placeholder="Confirm owner password"
              required
            />
            <label style={styles.label}>Account Role</label>
            <select
              style={styles.input}
              name="adminRole"
              value={form.adminRole}
              onChange={handleChange}
            >
              <option value="owner">Owner</option>
            </select>
            <label style={styles.label}>Owner Phone</label>
            <input
              style={styles.input}
              name="adminPhone"
              value={form.adminPhone}
              onChange={handleChange}
              placeholder="Enter owner phone"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating bar...' : 'Create Bar'}
          </Button>
        </form>
      </UnifiedCard>

      <UnifiedCard title="Bar Network Overview">
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Total Bars</div>
            <div style={styles.summaryValue}>{barStats.total}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Active Bars</div>
            <div style={styles.summaryValue}>{barStats.active}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Suspended Bars</div>
            <div style={styles.summaryValue}>{barStats.suspended}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Bars with Owner Contact</div>
            <div style={styles.summaryValue}>{barStats.ownerContacts}</div>
          </div>
        </div>

        <div style={styles.toolbar}>
          <input
            style={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bars, owners or contacts"
          />
          <div style={styles.toolbarHint}>
            Showing {filteredBars.length} of {bars.length} bars
          </div>
        </div>

        {filteredBars.length === 0 ? (
          <p style={styles.empty}>No matching bars found.</p>
        ) : (
          <div style={styles.cardList}>
            {filteredBars.map((bar) => {
              const barStatus = bar.status || 'active';
              return (
                <div key={bar._id || bar.id} style={styles.barCard}>
                  <div style={styles.cardHeader}>
                    <div style={styles.cardTitleBlock}>
                      <div style={styles.barTitleRow}>
                        <h3 style={styles.barName}>{bar.name}</h3>
                        <span style={{
                          ...styles.statusBadge,
                          ...(barStatus === 'active' ? styles.statusActive : barStatus === 'suspended' ? styles.statusSuspended : styles.statusDeleted)
                        }}>
                          {barStatus}
                        </span>
                      </div>
                      <div style={styles.metaRow}>
                        <span>Code: {bar.code || '-'}</span>
                        <span>• Registered: {bar.createdAt ? new Date(bar.createdAt).toLocaleDateString() : '-'}</span>
                        <span>• Sales accounts: {bar.activeSalesAccounts ?? 0}</span>
                      </div>
                    </div>
                    <div style={styles.headerActions}>
                      <button
                        type="button"
                        style={styles.resetButton}
                        onClick={() => handleResetOwnerPassword(bar._id)}
                      >
                        Reset Owner Password
                      </button>
                    </div>
                  </div>

                  <div style={styles.detailsGrid}>
                    <div style={styles.detailPanel}>
                      <h4 style={styles.panelTitle}>Bar Owner</h4>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Owner</span>
                        <span style={styles.detailValue}>{bar.owner?.fullName || bar.owner?.username || 'No owner assigned'}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Username</span>
                        <span style={styles.detailValue}>{bar.owner?.username || '-'}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Email</span>
                        <span style={styles.detailValue}>{bar.owner?.email || 'Not provided'}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Phone</span>
                        <span style={styles.detailValue}>{bar.owner?.phone || 'Not provided'}</span>
                      </div>
                    </div>

                    <div style={styles.detailPanel}>
                      <h4 style={styles.panelTitle}>Bar Details</h4>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Description</span>
                        <span style={styles.detailValue}>{bar.description || 'No description provided'}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Sales Accounts</span>
                        <span style={styles.detailValue}>{bar.activeSalesAccounts ?? 0}</span>
                      </div>
                      <div style={styles.detailItem}>
                        <span style={styles.detailLabel}>Owner ID</span>
                        <span style={styles.detailValue}>{bar.owner?.id ? String(bar.owner.id).slice(-8) : '-'}</span>
                      </div>
                    </div>
                  </div>

                  {bar.application && (
                    <div style={styles.applicationPanel}>
                      <h4 style={styles.panelTitle}>Application Details</h4>
                      <div style={styles.detailsGrid}>
                        <div style={styles.detailPanel}>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Application Name</span>
                            <span style={styles.detailValue}>{bar.application.barName || '-'}</span>
                          </div>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Application Code</span>
                            <span style={styles.detailValue}>{bar.application.barCode || '-'}</span>
                          </div>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Application Owner</span>
                            <span style={styles.detailValue}>{bar.application.ownerFullName || '-'}</span>
                          </div>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Application Email</span>
                            <span style={styles.detailValue}>{bar.application.ownerEmail || '-'}</span>
                          </div>
                        </div>
                        <div style={styles.detailPanel}>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Application Phone</span>
                            <span style={styles.detailValue}>{bar.application.ownerPhone || '-'}</span>
                          </div>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Application Username</span>
                            <span style={styles.detailValue}>{bar.application.ownerUsername || '-'}</span>
                          </div>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Application Status</span>
                            <span style={styles.detailValue}>{bar.application.status || '-'}</span>
                          </div>
                          <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Submitted</span>
                            <span style={styles.detailValue}>{bar.application.createdAt ? new Date(bar.application.createdAt).toLocaleDateString() : '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={styles.footerActions}>
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
                </div>
              );
            })}
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
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '18px'
  },
  summaryCard: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '14px 16px'
  },
  summaryLabel: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#64748b',
    fontWeight: '700',
    marginBottom: '6px'
  },
  summaryValue: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#0f172a'
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  searchInput: {
    flex: '1 1 260px',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #dbe2ea',
    fontSize: '14px'
  },
  toolbarHint: {
    color: '#64748b',
    fontSize: '14px'
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  barCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    padding: '16px',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '14px',
    flexWrap: 'wrap'
  },
  cardTitleBlock: {
    flex: 1
  },
  barTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '6px'
  },
  barName: {
    margin: 0,
    fontSize: '18px',
    color: '#0f172a'
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    color: '#64748b',
    fontSize: '13px'
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    marginBottom: '14px'
  },
  detailPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    padding: '12px',
    border: '1px solid #e2e8f0'
  },
  applicationPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    padding: '12px',
    border: '1px solid #e2e8f0',
    marginBottom: '12px'
  },
  panelTitle: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    color: '#334155',
    fontWeight: '700'
  },
  detailItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '4px 0',
    borderBottom: '1px solid #e2e8f0'
  },
  detailLabel: {
    fontWeight: '600',
    color: '#475569',
    fontSize: '13px'
  },
  detailValue: {
    textAlign: 'right',
    color: '#0f172a',
    fontSize: '13px',
    wordBreak: 'break-word'
  },
  footerActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
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
    borderColor: '#fbbf24',
    borderRadius: '8px',
    border: '1px solid transparent',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderColor: '#f87171',
    borderRadius: '8px',
    border: '1px solid transparent',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  restoreButton: {
    backgroundColor: '#d1fae5',
    color: '#166534',
    borderColor: '#34d399',
    borderRadius: '8px',
    border: '1px solid transparent',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
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
