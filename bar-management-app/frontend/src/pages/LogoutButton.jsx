import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const LogoutButton = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <button
      onClick={handleLogout}
      style={styles.button}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#c73652';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#e94560';
      }}
    >
      🚪 Logout
    </button>
  );
};

const styles = {
  button: {
    padding: '8px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease'
  }
};

export default LogoutButton;