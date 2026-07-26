import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    role: 'staff'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Check password match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Check password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { confirmPassword, ...registerData } = formData;
      const result = await register(registerData);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo}>🍸</span>
          <h1 style={styles.title}>Create Account</h1>
          <p style={styles.subtitle}>Register for Bar Manager</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Full Name *</label>
            <input
              type="text"
              name="fullName"
              style={styles.input}
              value={formData.fullName}
              onChange={handleChange}
              placeholder="Enter your full name"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Username *</label>
            <input
              type="text"
              name="username"
              style={styles.input}
              value={formData.username}
              onChange={handleChange}
              placeholder="Choose a username"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Email *</label>
            <input
              type="email"
              name="email"
              style={styles.input}
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password *</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                style={styles.passwordInput}
                value={formData.password}
                onChange={handleChange}
                placeholder="Min 6 characters"
                required
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

          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm Password *</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                style={styles.passwordInput}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                style={styles.eyeButton}
                onClick={toggleConfirmPasswordVisibility}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#e94560';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                }}
              >
                {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Role</label>
            <select
              name="role"
              style={styles.input}
              value={formData.role}
              onChange={handleChange}
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            style={styles.button}
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account? <Link to="/login" style={styles.link}>Sign in here</Link>
        </p>

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
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.1)'
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px'
  },
  logo: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '10px'
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
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
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
    transition: 'border 0.3s ease',
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
    transition: 'border 0.3s ease',
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
  footer: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#888',
    marginTop: '20px',
    marginBottom: 0
  },
  link: {
    color: '#e94560',
    textDecoration: 'none',
    fontWeight: '500'
  },
  branding: {
    marginTop: '18px',
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

export default Register;