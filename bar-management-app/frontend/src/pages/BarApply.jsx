import { useState } from 'react';
import api from '../api/api';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';
import Button from '../components/common/Button';

const BarApply = () => {
  const [form, setForm] = useState({
    barName: '',
    barCode: '',
    description: '',
    ownerFullName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerUsername: '',
    ownerPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        barName: form.barName.trim(),
        barCode: form.barCode.trim(),
        description: form.description.trim(),
        ownerFullName: form.ownerFullName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerPhone: form.ownerPhone.trim(),
        ownerUsername: form.ownerUsername.trim(),
        ownerPassword: form.ownerPassword
      };

      const res = await api.post('/bar-applications', payload);
      setMessage(res.data?.message || 'Your application was submitted successfully.');
      setForm({
        barName: '',
        barCode: '',
        description: '',
        ownerFullName: '',
        ownerEmail: '',
        ownerPhone: '',
        ownerUsername: '',
        ownerPassword: ''
      });
    } catch (err) {
      console.error('Application submission failed:', err);
      setError(err.response?.data?.message || 'Failed to submit application.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer title="📝 Apply for a Bar">
      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <UnifiedCard title="New Bar Owner Application">
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.grid}>
            <label style={styles.label}>Bar Name *</label>
            <input
              type="text"
              name="barName"
              value={form.barName}
              onChange={handleChange}
              style={styles.input}
              placeholder="Enter bar name"
              required
            />

            <label style={styles.label}>Bar Code</label>
            <input
              type="text"
              name="barCode"
              value={form.barCode}
              onChange={handleChange}
              style={styles.input}
              placeholder="Optional bar code"
            />

            <label style={styles.label}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              style={{ ...styles.input, minHeight: '90px' }}
              placeholder="Describe your bar"
            />

            <label style={styles.label}>Owner Full Name *</label>
            <input
              type="text"
              name="ownerFullName"
              value={form.ownerFullName}
              onChange={handleChange}
              style={styles.input}
              placeholder="Enter your full name"
              required
            />

            <label style={styles.label}>Owner Email *</label>
            <input
              type="email"
              name="ownerEmail"
              value={form.ownerEmail}
              onChange={handleChange}
              style={styles.input}
              placeholder="Enter your email"
              required
            />

            <label style={styles.label}>Owner Phone *</label>
            <input
              type="text"
              name="ownerPhone"
              value={form.ownerPhone}
              onChange={handleChange}
              style={styles.input}
              placeholder="Enter your phone number"
              required
            />

            <label style={styles.label}>Owner Username</label>
            <input
              type="text"
              name="ownerUsername"
              value={form.ownerUsername}
              onChange={handleChange}
              style={styles.input}
              placeholder="Optional username hint"
            />

            <label style={styles.label}>Owner Password</label>
            <input
              type="password"
              name="ownerPassword"
              value={form.ownerPassword}
              onChange={handleChange}
              style={styles.input}
              placeholder="Leave empty to generate automatically"
            />
          </div>

          <Button type="submit" disabled={loading} fullWidth>
            {loading ? 'Submitting application…' : 'Submit Application'}
          </Button>
        </form>
      </UnifiedCard>
    </PageContainer>
  );
};

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid #ddd',
    fontSize: '14px'
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

export default BarApply;
