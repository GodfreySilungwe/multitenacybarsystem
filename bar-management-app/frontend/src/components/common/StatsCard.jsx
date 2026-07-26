import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Format price with MK symbol - inline function
const formatPriceMK = (amount) => {
  if (amount === undefined || amount === null) return 'MK 0.00';
  return `MK ${Number(amount).toFixed(2)}`;
};

const StatsCard = ({ title, value, icon, color = '#e94560', isCurrency = true }) => {
  const displayValue = isCurrency ? formatPriceMK(value) : value;
  
  return (
    <div 
      className="stats-card"
      style={{ 
        ...styles.card, 
        borderLeft: `4px solid ${color}`,
        transition: 'all 0.3s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px)';
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      }}
    >
      <div style={styles.content}>
        <div>
          <div style={styles.title}>{title}</div>
          <div style={{ ...styles.value, color: color }}>{displayValue}</div>
        </div>
        <div style={{ ...styles.icon, backgroundColor: color }}>
          <FontAwesomeIcon icon={icon} style={{ fontSize: '24px' }} />
        </div>
      </div>
    </div>
  );
};

const styles = {
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    minWidth: '180px',
    width: '100%',
    cursor: 'pointer',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    transition: 'all 0.3s ease'
  },
  content: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: '14px',
    color: '#888',
    marginBottom: '8px',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  value: {
    fontSize: '28px',
    fontWeight: 'bold'
  },
  icon: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    flexShrink: 0
  }
};

export default StatsCard;