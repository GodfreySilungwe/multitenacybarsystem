const PageContainer = ({ children, title }) => {
  return (
    <div style={styles.container}>
      {title && <h1 style={styles.title}>{title}</h1>}
      <div style={styles.content}>
        {children}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '24px 30px',
    width: '100%',
    maxWidth: '100%',
    minHeight: 'calc(100vh - 80px)',
    backgroundColor: '#f0f2f5',
    boxSizing: 'border-box'
  },
  title: {
    fontSize: '28px',
    color: '#1a1a2e',
    marginBottom: '20px',
    fontWeight: '600',
    marginTop: 0
  },
  content: {
    width: '100%',
    maxWidth: '100%'
  }
};

export default PageContainer;