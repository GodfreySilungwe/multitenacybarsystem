# AWS API Gateway Setup for Bar Management App

This document describes the recommended AWS API Gateway configuration for the existing Express backend running on Lambda.

## Recommended Architecture

- API Gateway REST API or HTTP API
- Lambda integration for the backend (`backend/index.js` or `backend/lambda.js`)
- Single DynamoDB table for all entities, with tenant scoping via `barId`
- Optional CloudFront or API Gateway custom domain over the API

## API Routing Setup

### 1. Create API Gateway

For a simple setup, create a REST API or HTTP API:

- API type: HTTP API (recommended) or REST API
- Name: `bar-management-api`
- Protocol: HTTP
- Endpoint Type: Regional

### 2. Create a proxy route

Use a single proxy route so Express can handle internal routes directly.

#### For HTTP API

- Create route: `ANY /{proxy+}`
- Enable CORS
- Integration type: Lambda function
- Lambda: backend function exported from `backend/lambda.js`
- Configure the integration to use the proxy event payload

#### For REST API

- Create method: `ANY` on resource `/{proxy+}`
- Enable `Use Lambda Proxy integration`
- Add OPTIONS method on `/{proxy+}` for CORS preflight
- Enable CORS on the resource

### 3. Stage and deployment

Deploy the API to a stage, for example: `prod`.

- Stage name: `prod`
- Deployment: `prod`
- Stage variables (optional): no special stage variables are required unless you want separate backend environments.

### 4. API path and Express routing

The backend Express app expects internal routes like `/api/auth`, `/api/products`, `/api/bars`, etc.

#### Option A: Keep `/api` in Express and use the same path in the frontend

- Frontend base URL: `https://<api-id>.execute-api.<region>.amazonaws.com/prod`
- API endpoints: `https://<api-id>.execute-api.<region>.amazonaws.com/prod/api/auth/login`, `.../api/bars`

#### Option B: Use domain base path mapping

- Custom domain: `api.example.com`
- Base path mapping: map `/` to the selected stage
- API endpoints: `https://api.example.com/api/auth/login`

### 5. CORS configuration

Express already handles CORS via `corsOptions`, but API Gateway must allow OPTIONS as well.

For HTTP API:

- Enable CORS
- Allow origin: `*` or your frontend domain list
- Allow methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`
- Allow headers: `Content-Type, Authorization, X-Requested-With`
- Allow credentials: true if needed

For REST API:

- Enable CORS for the proxy resource
- Add OPTIONS method with mock integration if needed
- Pass through headers `Content-Type, Authorization, X-Requested-With`

### 6. CloudFront / custom domain (optional)

If hosting the frontend on S3/CloudFront:

- Create CloudFront distribution for the frontend site
- Add an origin for the API Gateway endpoint
- Use behaviors such as:
  - `/*` → frontend origin
  - `/api/*` → API Gateway origin
- Enable headers: `Authorization`, `Content-Type`, `Origin`

## Lambda configuration

Use the current handler export from `backend/server.js`:

- Lambda entry file: `backend/lambda.js`
- Handler: `handler`
- Runtime: Node.js 18.x or newer
- Environment variables:
  - `DYNAMODB_TABLE_NAME` = target table name
  - `AWS_REGION` = region (for local dev or Lambda)
  - `JWT_SECRET` or `JWT_SECRET_KEY`
  - `CORS_ALLOWED_ORIGINS` = comma-separated allowed domains
  - `DEFAULT_OWNER_*` = initial global owner account values

### Permissions

The Lambda function must be granted:

- `dynamodb:DescribeTable`
- `dynamodb:CreateTable`
- `dynamodb:PutItem`
- `dynamodb:GetItem`
- `dynamodb:Scan`
- `dynamodb:DeleteItem`
- `dynamodb:UpdateItem`
- `s3:PutObject` / `s3:GetObject` if using uploads

## Tenant-aware route details

The backend now supports multi-tenant bar data in the same table:

- `barId` is added to all non-`bar` entities on create
- `Bar` entities remain global resources
- `User` entities can be scoped to a `barId`
- Global owner users have `role: owner` and `barId: null`
- Bar owners and bar-level admins have `role: owner` and `barId: <bar-id>`
- Endpoint `/api/bars` is protected for global owners only

## Important API endpoints added

- `POST /api/bars` - create a new bar and initial bar admin user
- `GET /api/bars` - list bars (global owner only)
- `GET /api/bars/{id}` - retrieve one bar

## Frontend wiring

The frontend now includes:

- `/bars` route for global owners
- Sidebar navigation item visible only to global owners
- `Bars` page for creating and viewing bars
- `AuthContext` updated to expose `isGlobalOwner`

## Deployment notes

- If using S3 + CloudFront for frontend, route `/api/*` to API Gateway origin.
- If not using a custom domain, use the API Gateway invoke URL directly.
- Keep Express route prefix `/api` consistent between frontend and backend.
