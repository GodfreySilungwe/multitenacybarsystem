const Card = ({ title, children, style = {} }) => {
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
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    marginBottom: '20px'
  },
  title: {
    margin: '0 0 15px 0',
    color: '#1a1a2e',
    fontSize: '18px',
    borderBottom: '2px solid #f0f0f0',
    paddingBottom: '10px'
  }
};

export default Card;