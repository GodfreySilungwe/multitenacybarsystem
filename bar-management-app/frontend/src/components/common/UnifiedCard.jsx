const UnifiedCard = ({ title, children, style = {} }) => {
  return (
    <div style={{ ...styles.card, ...style }}>
      {title && <h3 style={styles.title}>{title}</h3>}
      <div>{children}</div>
    </div>
  );
};

const styles = {
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    marginBottom: '20px',
    width: '100%',
    boxSizing: 'border-box'
  },
  title: {
    margin: '0 0 15px 0',
    color: '#1a1a2e',
    fontSize: '18px',
    fontWeight: '600'
  }
};

export default UnifiedCard;