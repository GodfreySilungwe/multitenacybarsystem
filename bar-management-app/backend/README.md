# Backend

The backend uses a single-table DynamoDB design. Orders are stored in the main table and copied into secondary indexes only when they match the access pattern required by the application.

## DynamoDB Indexes

### GSI1: Bar order date index

Key attributes:

```text
GSI1PK = BAR#<barId>#ORDER
GSI1SK = <createdAt>#<orderId>
```

Purpose:

- Query orders for one bar.
- Query orders within a date range.
- Support dashboard sales periods and report periods.
- Sort orders by creation time.

The shared `queryEntities('order', options)` helper uses GSI1 automatically when an order query includes `barId`. Date filters are applied to `GSI1SK` when `startDate` or `endDate` is provided.

GSI1 does not index payment status or outstanding balance. A query that uses GSI1 for a full historical period can still read many order records before application-level filtering.

### GSI2: Customer active-credit index

Key attributes:

```text
GSI2PK = BAR#<barId>#CUSTOMER#<customerId>#CREDIT
GSI2SK = <createdAt>#<orderId>
```

Purpose:

- Query active unpaid credit orders for one customer.
- Calculate a customer credit balance.
- Display a customer's outstanding credit orders.
- Support customer credit settlement operations.

The `queryActiveCreditOrders(barId, customerId)` helper queries GSI2 directly.

An order is written to GSI2 only when it is:

- a credit order
- not reversed
- linked to a customer
- carrying a positive outstanding balance

When the order becomes fully paid or reversed, its GSI2 attributes are removed during the normal order update. Paid historical credit orders therefore do not remain in GSI2.

### GSI3: Bar active-credit index

Key attributes:

```text
GSI3PK = BAR#<barId>#ACTIVE-CREDIT
GSI3SK = <customerId>#<createdAt>#<orderId>
```

Purpose:

- Query all active unpaid credit orders for one bar.
- Build the dashboard's customers with unsettled bills table.
- Calculate total outstanding credit and open credit order counts across a bar.
- Build bar-level outstanding credit by sales account.

The `queryActiveCreditOrdersByBar(barId)` helper queries GSI3 directly. GSI3 is used for dashboard active-credit metrics, while GSI2 remains the customer-specific index.

An order is written to GSI3 under the same active-credit conditions as GSI2. When it is fully paid, reversed, or otherwise no longer eligible, its GSI3 attributes are removed.

Existing orders can be indexed with:

```powershell
node scripts/backfillActiveCreditOrderGsi.js --apply --page-size=100 --concurrency=5
```

The script is dry-run by default. Add `--apply` to write GSI3 attributes.

## Dashboard and Reports

### Dashboard

Dashboard requests use `dashboard=true`.

- Date-range sales metrics use GSI1.
- Active unpaid credit metrics use GSI3.
- Customer count uses `/customers/summary?countOnly=true`.
- Historical order fallback is used when the selected period contains confirmed payments without allocation metadata. This preserves FIFO settlement calculations for legacy payments.

The dashboard avoids loading detailed customer records solely to display the customer count.

### Reports

Reports request `optimized=true` without `dashboard=true`.

- Date-range sales and product metrics use GSI1.
- Current credit exposure, accumulated customer balances, and outstanding credit by sales account use GSI3.
- A historical order read is retained only when the selected period has positive confirmed payments without allocation metadata, to preserve legacy FIFO settlement calculations.
- Confirmed customer payments are used to calculate settlement totals and payment-method summaries.

The confirmed payment records are still loaded and filtered by period in application code. GSI3 avoids reading paid credit orders just to calculate current outstanding-credit sections.

## Write-path behavior

Order creation and updates use the shared serializer in `lib/dynamodb.js`. It creates GSI1 keys for every order and creates GSI2/GSI3 keys only for eligible active unpaid credit orders. Re-saving an order rebuilds these attributes, which removes stale GSI2/GSI3 keys after payment or reversal.
