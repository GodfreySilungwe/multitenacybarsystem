const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const awsServerlessExpress = require('aws-serverless-express');
const inventoryRoutes = require('./routes/inventory');
const exportRoutes = require('./routes/export');
const supplierRoutes = require('./routes/suppliers');
const purchaseOrderRoutes = require('./routes/purchase-orders');
const { ensureTableExists } = require('./lib/dynamodb');
const { tenantContextMiddleware } = require('./lib/tenantContext');
const { optionalAuth } = require('./middleware/auth');
const barRoutes = require('./routes/bars');
const barApplicationRoutes = require('./routes/bar-applications');

dotenv.config();

const app = express();
app.use(tenantContextMiddleware);
app.use(optionalAuth);

// Simple request logger to help diagnose CloudFront / API Gateway path issues
app.use((req, res, next) => {
  try {
    console.log('➡️ Incoming request:', req.method, req.originalUrl || req.url);
    console.log('   headers:', {
      host: req.headers.host,
      'x-forwarded-for': req.headers['x-forwarded-for'],
      referer: req.headers.referer
    });
  } catch (e) {
    // ignore logging errors
  }
  next();
});

const defaultAllowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://multitenacys3webbucket.s3-website-us-east-1.amazonaws.com',
  'https://multitenacys3webbucket.s3-website-us-east-1.amazonaws.com',
  'http://www.smartbar.tech',
  'http://smartbar.tech',
  'https://www.smartbar.tech',
  'https://smartbar.tech',
  'http://www.smartbarmw.tech',
  'https://www.smartbarmw.tech',
  'https://smartbarmw.tech',
  'https://d3hizi1y25kzis.cloudfront.net',
  'https://01uy0put6a.execute-api.us-east-1.amazonaws.com'
];

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || defaultAllowedOrigins.join(','))
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (/\.cloudfront\.net$/i.test(origin)) {
    return true;
  }

  if (/\.s3-website-us-east-1\.amazonaws\.com$/i.test(origin)) {
    return true;
  }

  if (/\.execute-api\.us-east-1\.amazonaws\.com$/i.test(origin)) {
    return true;
  }

  return /^(https?:\/\/)?(www\.)?(smartbar|smartbarmw)\.tech$/i.test(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  if (!req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      req.body = req.body || {};
    } catch (e) {
      // ignore
    }
  }
  next();
});

app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/inventory', inventoryRoutes);

// Import routes
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const customerRoutes = require('./routes/customers');
const orderRoutes = require('./routes/orders');
const uploadRoutes = require('./routes/uploads');
const customerOrderRequestRoutes = require('./routes/customer-order-requests');
const userRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');

// Use routes
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/bar-applications', '/bar-applications'], barApplicationRoutes);
app.use(['/api/bars', '/bars'], barRoutes);
app.use(['/api/categories', '/categories'], categoryRoutes);
app.use(['/api/products', '/products'], productRoutes);
app.use(['/api/customers', '/customers'], customerRoutes);
app.use(['/api/orders', '/orders'], orderRoutes);
app.use(['/api/uploads', '/uploads'], uploadRoutes);
app.use(['/api/customer-order-requests', '/customer-order-requests'], customerOrderRequestRoutes);
app.use(['/api/users', '/users'], userRoutes);
app.use(['/api/audit', '/audit'], auditRoutes);

// Root info route
app.get('/', (req, res) => {
  res.json({ message: 'API root. Use /api/auth/login or /api/health' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running!', table: process.env.DYNAMODB_TABLE_NAME});
});

let server;
let initializationPromise = null;

async function initializeServerState() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    await ensureTableExists();
    await require('./routes/auth').ensureDefaultOwnerUser();
  })();

  return initializationPromise;
}

async function startServer() {
  await initializeServerState();

  const PORT = process.env.PORT || 5000;
  server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('❌ Server startup error:', error.message);
    process.exit(1);
  });
}

const lambdaServer = awsServerlessExpress.createServer(app);
function normalizeLambdaEvent(event) {
  if (!event.path) {
    event.path = event.rawPath || event.requestContext?.http?.path || event.path;
  }

  if (!event.httpMethod) {
    event.httpMethod = event.requestContext?.http?.method || event.httpMethod;
  }

  if (!event.headers) {
    event.headers = {};
  }

  if (!event.queryStringParameters && event.rawQueryString) {
    const params = new URLSearchParams(event.rawQueryString);
    const query = {};

    for (const [key, value] of params.entries()) {
      if (query[key] !== undefined) {
        query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
      } else {
        query[key] = value;
      }
    }

    event.queryStringParameters = query;
  }

  return event;
}

async function handler(event, context) {
  await initializeServerState();
  context.callbackWaitsForEmptyEventLoop = false;
  normalizeLambdaEvent(event);
  console.log('Lambda event normalized:', {
    path: event.path,
    httpMethod: event.httpMethod,
    rawPath: event.rawPath,
    rawQueryString: event.rawQueryString,
    queryStringParameters: event.queryStringParameters
  });

  try {
    const resp = await awsServerlessExpress.proxy(lambdaServer, event, context, 'PROMISE').promise;
    return resp;
  } catch (error) {
    console.error('Lambda proxy error:', error && error.stack ? error.stack : error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: error?.message || 'Internal server error' })
    };
  }
}

module.exports = {
  app,
  handler
};

// Express catch-all for non-matching routes (return JSON instead of HTML)
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Global Express error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err && err.stack ? err.stack : err);
  res.status(500).json({ message: err?.message || 'Internal server error' });
});