const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function tenantContextMiddleware(req, res, next) {
  storage.run({ barId: null, userId: null, role: null, isGlobalAdmin: false }, () => next());
}

function setTenantContext({ barId = null, userId = null, role = null, isGlobalAdmin = false }) {
  const store = storage.getStore();
  if (!store) return;
  store.barId = barId;
  store.userId = userId;
  store.role = role;
  store.isGlobalAdmin = isGlobalAdmin;
}

function getTenantId() {
  const store = storage.getStore();
  return store?.barId || null;
}

function isGlobalAdmin() {
  const store = storage.getStore();
  return Boolean(store?.isGlobalAdmin);
}

function getTenantContext() {
  return storage.getStore() || {};
}

module.exports = {
  tenantContextMiddleware,
  setTenantContext,
  getTenantId,
  isGlobalAdmin,
  getTenantContext
};
