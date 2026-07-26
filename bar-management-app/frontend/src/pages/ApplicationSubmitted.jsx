import { Link } from 'react-router-dom';
import PageContainer from './PageContainer';
import UnifiedCard from '../components/common/UnifiedCard';

const ApplicationSubmitted = () => {
  return (
    <PageContainer title="✅ Application Submitted">
      <UnifiedCard title="Thank you for applying!">
        <p style={styles.message}>
          Your bar application has been received. A global owner will review it shortly and reach out using the details you provided.
        </p>
        <div style={styles.actions}>
          <Link to="/" style={styles.linkButton}>
            Back to Home
          </Link>
        </div>
      </UnifiedCard>
    </PageContainer>
  );
};

const styles = {
  message: {
    fontSize: '16px',
    color: '#334155',
    lineHeight: '1.7',
    marginBottom: '18px'
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-start'
  },
  linkButton: {
    padding: '12px 20px',
    backgroundColor: '#e94560',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '10px',
    fontWeight: '700'
  }
};

export default ApplicationSubmitted;
