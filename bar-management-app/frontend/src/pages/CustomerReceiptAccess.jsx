import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';

const CustomerReceiptAccess = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const redemptionStarted = useRef(false);
  const { acceptSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (redemptionStarted.current) return;
    redemptionStarted.current = true;

    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`);

    if (!token) {
      setError('This customer access link is invalid or expired.');
      setLoading(false);
      return;
    }

    const redeemAccessLink = async () => {
      try {
        const response = await api.post('/auth/customer-receipt-access/redeem', { token });
        acceptSession(response.data.token, response.data.user);
        navigate('/customer-portal', { replace: true });
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'This customer access link is invalid, expired, or already used.');
        setLoading(false);
      }
    };

    redeemAccessLink();
  }, [acceptSession, location.hash, location.pathname, location.search, navigate]);

  return (
    <main style={styles.container}>
      <section style={styles.content}>
        <h1 style={styles.title}>SMART BAR</h1>
        {loading ? (
          <p style={styles.message}>Opening your account...</p>
        ) : (
          <>
            <p style={styles.error}>{error}</p>
            <Link to="/login" style={styles.link}>Sign in with your customer credentials</Link>
          </>
        )}
      </section>
    </main>
  );
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
    backgroundColor: '#f6f7f8',
    fontFamily: 'Arial, sans-serif'
  },
  content: {
    width: '100%',
    maxWidth: '420px',
    padding: '28px',
    border: '1px solid #e3e6e8',
    borderRadius: '8px',
    backgroundColor: '#fff',
    textAlign: 'center'
  },
  title: {
    margin: '0 0 16px',
    color: '#e94560',
    fontSize: '22px'
  },
  message: {
    margin: 0,
    color: '#475467'
  },
  error: {
    margin: '0 0 16px',
    color: '#b42318'
  },
  link: {
    color: '#1d2939',
    fontWeight: '600'
  }
};

export default CustomerReceiptAccess;