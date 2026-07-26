import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Layout from './components/common/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Customers from './pages/Customers';
import Orders from './pages/Orders';
import CustomerPortal from './pages/CustomerPortal';
import Reports from './pages/Reports';
import Inventory from './pages/Inventory';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import Settings from './pages/Settings';
import Bars from './pages/Bars';

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
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />

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
            <ProtectedRoute salesOnly>
              <Layout>
                <Orders />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/customers" element={
            <ProtectedRoute>
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
            <ProtectedRoute ownerOnly>
              <Layout>
                <Products />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/categories" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Categories />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/inventory" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Inventory />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/suppliers" element={
            <ProtectedRoute ownerOnly>
              <Layout>
                <Suppliers />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/purchase-orders" element={
            <ProtectedRoute ownerOnly>
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
          <Route path="/bars" element={
            <ProtectedRoute globalOwnerOnly>
              <Layout>
                <Bars />
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;