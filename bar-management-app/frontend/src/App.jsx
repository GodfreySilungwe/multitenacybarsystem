import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Layout from './components/common/Layout';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Products = lazy(() => import('./pages/Products'));
const Categories = lazy(() => import('./pages/Categories'));
const Customers = lazy(() => import('./pages/Customers'));
const Orders = lazy(() => import('./pages/Orders'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const Reports = lazy(() => import('./pages/Reports'));
const PaymentHistory = lazy(() => import('./pages/PaymentHistory'));
const Inventory = lazy(() => import('./pages/Inventory'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const Settings = lazy(() => import('./pages/Settings'));
const Bars = lazy(() => import('./pages/Bars'));
const BarApply = lazy(() => import('./pages/BarApply'));
const BarApplications = lazy(() => import('./pages/BarApplications'));
const ApplicationSubmitted = lazy(() => import('./pages/ApplicationSubmitted'));

const HomeRoute = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: '24px' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === 'customer') {
    return <Navigate to="/customer-portal" replace />;
  }

  if (user?.role === 'sales') {
    return (
      <Layout>
        <Dashboard />
      </Layout>
    );
  }

  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes - All authenticated users */}
            <Route path="/" element={
              <ProtectedRoute>
                <HomeRoute />
              </ProtectedRoute>
            } />
            <Route path="/pos" element={
              <ProtectedRoute salesOnly>
                <Layout>
                  <POS />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute barOwnerOrSales>
                <Layout>
                  <Orders />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/customers" element={
              <ProtectedRoute barOwnerOrSales>
                <Layout>
                  <Customers />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/customer-portal" element={
              <ProtectedRoute customerOnly>
                <Layout>
                  <CustomerPortal />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Owner Only Routes */}
            <Route path="/products" element={
              <ProtectedRoute barOwnerOnly>
                <Layout>
                  <Products />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/categories" element={
              <ProtectedRoute barOwnerOnly>
                <Layout>
                  <Categories />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute barOwnerOnly>
                <Layout>
                  <Reports />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/payment-history" element={
              <ProtectedRoute barOwnerOrSales>
                <Layout>
                  <PaymentHistory />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/audit-log" element={
              <ProtectedRoute barOwnerOnly>
                <Layout>
                  <AuditLog />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/inventory" element={
              <ProtectedRoute barOwnerOnly>
                <Layout>
                  <Inventory />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/suppliers" element={
              <ProtectedRoute barOwnerOnly>
                <Layout>
                  <Suppliers />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/purchase-orders" element={
              <ProtectedRoute barOwnerOnly>
                <Layout>
                  <PurchaseOrders />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute ownerOnly>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/apply" element={<BarApply />} />
            <Route path="/application-submitted" element={<ApplicationSubmitted />} />
            <Route path="/bar-applications" element={
              <ProtectedRoute globalOwnerOnly>
                <Layout>
                  <BarApplications />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/bars" element={
              <ProtectedRoute globalOwnerOnly>
                <Layout>
                  <Bars />
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;