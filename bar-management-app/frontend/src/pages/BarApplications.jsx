import { useEffect, useState } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';

const BarApplications = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const res = await api.get('/bar-applications');
      setApplications(res.data || []);
    } catch (err) {
      console.error('Error loading bar applications:', err);
      setError(err.response?.data?.message || 'Unable to load applications');
    } finally {
      setLoading(false);
    }
  };

  const updateApplicationStatus = async (id, action) => {
    try {
      setActionLoading(id);
      setMessage('');
      setError('');
      const res = await api.patch(`/bar-applications/${id}/${action}`);
      setMessage(res.data?.message || `Application ${action}ed successfully.`);
      await loadApplications();
    } catch (err) {
      console.error(`Error ${action}ing application:`, err);
      setError(err.response?.data?.message || `Unable to ${action} application.`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <PageContainer title="📝 Bar Applications">
      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <UnifiedCard title="Pending Bar Applications">
        {loading ? (
          <p style={styles.loading}>Loading applications…</p>
        ) : applications.length === 0 ? (
          <p style={styles.empty}>No bar applications found.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>Bar Name</th>
                  <th>Owner</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application._id || application.id}>
                    <td>{application.barName}</td>
                    <td>{application.ownerFullName}</td>
                    <td>{application.ownerEmail}</td>
                    <td>{application.ownerPhone}</td>
                    <td style={styles.status}>{application.status}</td>
                    <td>{new Date(application.createdAt).toLocaleString()}</td>
                    <td style={styles.actionsCell}>
                      {application.status === 'pending' ? (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => updateApplicationStatus(application._id, 'approve')}
                            disabled={actionLoading === application._id}
                            style={styles.actionButton}
                          >
                            {actionLoading === application._id ? 'Processing…' : 'Approve'}
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => updateApplicationStatus(application._id, 'reject')}
                            disabled={actionLoading === application._id}
                            style={styles.actionButton}
                          >
                            {actionLoading === application._id ? 'Processing…' : 'Reject'}
                          </Button>
                        </>
                      ) : (
                        <span style={styles.noActions}>No actions</span>
                      )}
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
  loading: {
    color: '#666'
  },
  empty: {
    color: '#666'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  status: {
    textTransform: 'capitalize',
    fontWeight: '700'
  },
  actionsCell: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  actionButton: {
    minWidth: '90px'
  },
  noActions: {
    color: '#888'
  },
  success: {
    marginBottom: '16px',
    padding: '14px',
    borderRadius: '12px',
    backgroundColor: '#eafaf1',
    color: '#166534'
  },
  error: {
    marginBottom: '16px',
    padding: '14px',
    borderRadius: '12px',
    backgroundColor: '#fbeaea',
    color: '#9f3a38'
  }
};

export default BarApplications;
