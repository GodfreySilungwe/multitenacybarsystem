import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChartBar, 
  faCashRegister, 
  faBox, 
  faTags, 
  faUsers, 
  faClipboardList,
  faChartPie,
  faClipboardCheck,
  faTruck,
  faShoppingCart,
  faMoneyBillWave,
  faCog,
  faTools,
  faBuilding,
  faSignOutAlt
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/api';

const Sidebar = ({ isMobileOpen = false, onClose = () => {} }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [pendingApplications, setPendingApplications] = useState(0);

  const handleLogout = () => {
    logout();
    onClose();
    navigate('/login');
  };

  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const res = await api.get('/bar-applications');
        const apps = res.data || [];
        const pending = apps.filter((application) => application.status === 'pending').length;
        setPendingApplications(pending);
      } catch (err) {
        console.error('Could not load pending application count:', err);
      }
    };

    loadPendingCount();
  }, []);
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: faChartBar, authOnly: true },
    { path: '/pos', label: 'POS', icon: faCashRegister, salesOnly: true },
    { path: '/products', label: 'SMART BAR', icon: faTools, barOwnerOnly: true },
    { path: '/categories', label: 'Categories', icon: faTags, barOwnerOnly: true },
    { path: '/customers', label: 'Customers', icon: faUsers, salesAndOwnerOnly: true },
    { path: '/orders', label: 'Orders', icon: faClipboardList, barOwnerOrSales: true },
    { path: '/payment-history', label: 'Payment History', icon: faMoneyBillWave, barOwnerOrSales: true },
    { path: '/reports', label: 'Reports', icon: faChartPie, barOwnerOnly: true },
    { path: '/inventory', label: 'Inventory', icon: faClipboardCheck, barOwnerOnly: true },
    { path: '/suppliers', label: 'Suppliers', icon: faTruck, barOwnerOnly: true },
    { path: '/purchase-orders', label: 'Purchase Orders', icon: faShoppingCart, barOwnerOnly: true },
    { path: '/settings', label: 'Settings', icon: faCog, ownerOnly: true },
    { path: '/bars', label: 'Bars', icon: faBuilding, globalOnly: true },
    { path: '/bar-applications', label: 'Applications', icon: faClipboardList, globalOnly: true }
  ];

  const role = user?.role;
  const isBarOwner = role === 'owner' && !!user?.barId;
  const showMyAccount = role === 'customer';
  const showGlobalOwner = role === 'owner' && !user?.barId;

  const filteredNavItems = navItems.filter((item) => {
    if (showMyAccount) {
      return item.customerOnly === true || item.path === '/customer-portal';
    }

    if (role === 'sales') {
      return item.salesOnly === true || item.salesAndOwnerOnly === true || item.barOwnerOrSales === true || item.path === '/';
    }

    if (showGlobalOwner) {
      return item.globalOnly === true || item.path === '/' || item.ownerOnly === true;
    }

    if (isBarOwner) {
      return item.barOwnerOnly === true || item.barOwnerOrSales === true || item.path === '/' || item.ownerOnly === true;
    }

    return false;
  });

  if (showMyAccount) {
    filteredNavItems.unshift({ path: '/customer-portal', label: 'My Account', icon: faUsers });
  }

  return (
    <div style={{ ...styles.sidebar, ...(window.innerWidth < 900 ? { transform: isMobileOpen ? 'translateX(0)' : 'translateX(-100%)' } : {}) }}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>🍹</span>
        <span style={styles.logoText}>SMART BAR</span>
        {window.innerWidth < 900 && (
          <button type="button" onClick={onClose} style={styles.closeButton} aria-label="Close menu">
            ✕
          </button>
        )}
      </div>

      <nav style={styles.nav}>
        {filteredNavItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              ...styles.navLink,
              ...(location.pathname === item.path ? styles.navLinkActive : {})
            }}
            onMouseEnter={(e) => {
              if (location.pathname !== item.path) {
                e.currentTarget.style.backgroundColor = '#2d2d4a';
                e.currentTarget.style.color = 'white';
              }
            }}
            onMouseLeave={(e) => {
              if (location.pathname !== item.path) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#aaa';
              }
            }}
          >
            <FontAwesomeIcon icon={item.icon} style={styles.navIcon} />
            <span>{item.label}</span>
            {item.path === '/bar-applications' && pendingApplications > 0 && (
              <span style={styles.badge}>{pendingApplications}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* Footer with User Info & Logout */}
      <div style={styles.footer}>
        <div style={styles.userInfo}>
          <div style={styles.userName}>{user?.fullName || 'User'}</div>
          <div style={styles.userRole}>{user?.role || 'Staff'}</div>
        </div>
        <button
          style={styles.logoutBtn}
          onClick={handleLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#c73652';
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#e94560';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <FontAwesomeIcon icon={faSignOutAlt} style={{ marginRight: '8px' }} />
          Logout
        </button>
        <div style={styles.version}>v1.0.0</div>
      </div>
    </div>
  );
};

const styles = {
  sidebar: {
    width: '220px',
    height: '100vh',
    backgroundColor: '#1a1a2e',
    color: 'white',
    position: 'fixed',
    top: 0,
    left: 0,
    overflowY: 'auto',
    padding: '20px 0',
    zIndex: 1000,
    boxShadow: '2px 0 10px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 20px',
    marginBottom: '30px',
    fontSize: '20px',
    fontWeight: 'bold'
  },
  closeButton: {
    marginLeft: 'auto',
    border: 'none',
    background: 'transparent',
    color: 'white',
    fontSize: '18px',
    cursor: 'pointer'
  },
  logoIcon: {
    fontSize: '28px'
  },
  logoText: {
    color: '#e94560'
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1
  },
  navLink: {
    color: '#aaa',
    textDecoration: 'none',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    transition: 'all 0.3s ease',
    fontSize: '15px',
    borderRadius: '0 20px 20px 0',
    marginRight: '10px'
  },
  navLinkActive: {
    color: 'white',
    backgroundColor: '#e94560',
    boxShadow: '0 4px 15px rgba(233, 69, 96, 0.4)'
  },
  navIcon: {
    fontSize: '18px',
    width: '24px'
  },
  badge: {
    marginLeft: 'auto',
    minWidth: '24px',
    padding: '4px 8px',
    borderRadius: '100px',
    backgroundColor: '#e94560',
    color: 'white',
    fontSize: '12px',
    fontWeight: '700',
    textAlign: 'center'
  },
  footer: {
    padding: '15px 20px 10px 20px',
    borderTop: '1px solid #2d2d4a',
    marginTop: 'auto'
  },
  userInfo: {
    padding: '8px 0',
    marginBottom: '10px',
    textAlign: 'center'
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'white',
    marginBottom: '2px'
  },
  userRole: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'capitalize'
  },
  logoutBtn: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e94560',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '10px'
  },
  version: {
    fontSize: '11px',
    color: '#555',
    textAlign: 'center'
  }
};

export default Sidebar;