import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWineBottle } from '@fortawesome/free-solid-svg-icons';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated, loading: authLoading, user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(user?.role === 'customer' ? '/customer-portal' : '/', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.error || 'Login failed');
        return;
      }

      navigate(result.user?.role === 'customer' ? '/customer-portal' : '/', { replace: true });
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>
            <FontAwesomeIcon icon={faWineBottle} style={styles.logoIcon} />
            <span style={styles.logoText}>SMART BAR</span>
          </div>
          <h1 style={styles.title}>Welcome Back</h1>
          <p style={styles.subtitle}>Sign in to your account</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              style={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#e94560';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#ddd';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                style={styles.passwordInput}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#e94560';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(233, 69, 96, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#ddd';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                style={styles.eyeButton}
                onClick={togglePasswordVisibility}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e94560';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                }}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            style={styles.button}
            disabled={loading}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(233, 69, 96, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={styles.applySection}>
          <p style={styles.applyText}>New bar apply here <Link to="/apply" style={styles.applyLink}>Apply here</Link></p>
        </div>

        <div style={styles.registerSection}>
          <p style={styles.registerText}>
            Don't have an account? <Link to="/register" style={styles.registerLink}>Register here</Link>
          </p>
        </div>

        <div style={styles.branding}>
          <div style={styles.brandRow}>
            <span style={styles.brandLabel}>Designed by</span>
            <a href="https://www.goshsolutions.tech" target="_blank" rel="noopener noreferrer" style={styles.brandLink}>Gosh Solutions</a>
          </div>
          <div style={styles.brandRow}>
            <span style={styles.brandLabel}>Phone</span>
            <a href="tel:+265995718815" style={styles.brandLink}>+265 995 718 815</a>
          </div>
          <div style={styles.brandRow}>
            <span style={styles.brandLabel}>Email</span>
            <a href="mailto:hello@goshsolutions.tech" style={styles.brandLink}>hello@goshsolutions.tech</a>
          </div>
          <div style={styles.brandRow}>
            <span style={styles.brandLabel}>Website</span>
            <a href="https://www.goshsolutions.tech" target="_blank" rel="noopener noreferrer" style={styles.brandLink}>www.goshsolutions.tech</a>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f0f2f5',
    padding: '20px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.1)'
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '20px'
  },
  logoIcon: {
    fontSize: '32px',
    color: '#e94560'
  },
  logoText: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1a1a2e'
  },
  title: {
    fontSize: '24px',
    color: '#1a1a2e',
    margin: '0 0 5px 0'
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    margin: 0
  },
  error: {
    backgroundColor: '#fde8e8',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    border: '1px solid #f5c6cb'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    outline: 'none'
  },
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  passwordInput: {
    padding: '10px 14px',
    paddingRight: '50px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    outline: 'none',
    width: '100%'
  },
  eyeButton: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '20px',
    color: '#888',
    padding: '4px',
    transition: 'color 0.3s ease'
  },
  button: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginTop: '10px'
  },
  branding: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#64748b',
    textAlign: 'center'
  },
  brandRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  applySection: {
    marginTop: '20px',
    textAlign: 'center'
  },
  applyText: {
    color: '#475569',
    fontSize: '14px'
  },
  applyLink: {
    color: '#e94560',
    textDecoration: 'none',
    fontWeight: '700'
  },
  registerSection: {
    marginTop: '14px',
    textAlign: 'center'
  },
  registerText: {
    color: '#475569',
    fontSize: '14px',
    margin: 0
  },
  registerLink: {
    color: '#1d4ed8',
    textDecoration: 'none',
    fontWeight: '700'
  },
  brandLabel: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#94a3b8'
  },
  brandLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: '600'
  }
};

export default Login;