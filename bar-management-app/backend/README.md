# Backend

The backend uses a single-table DynamoDB design. Orders are stored in the main table and copied into secondary indexes only when they match the access pattern required by the application.

## DynamoDB Indexes

### GSI1: Bar/date entity index

Key attributes:

```text
GSI1PK = BAR#<barId>#ORDER
GSI1SK = <createdAt>#<orderId>
```

Inventory adjustment rows use the same index attributes with this partition:

```text
GSI1PK = BAR#<barId>#INVENTORY-ADJUSTMENT
GSI1SK = <createdAt>#<adjustmentId>
```

Purpose:

- Query orders for one bar.
- Query orders within a date range.
- Support dashboard sales periods and report periods.
- Sort orders by creation time.

The shared `queryEntities(entityType, options)` helper uses GSI1 automatically for bar-scoped order and inventory-adjustment queries. Date filters are applied to `GSI1SK`, and inventory history uses cursor pages in newest-first order.

GSI1 does not index payment status or outstanding balance. A query that uses GSI1 for a full historical period can still read many order records before application-level filtering.

Existing inventory adjustments can be indexed with:

```powershell
node scripts/backfillInventoryAdjustmentGsi.js
```

Review the dry-run output, then add `--apply` to write missing GSI1 keys before deploying the paginated inventory history endpoint.

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

### GSI4: Bar payment status/date index

Key attributes:

```text
GSI4PK = BAR#<barId>#PAYMENT#<status>
GSI4SK = <createdAt>#<paymentId>
```

Purpose:

- Query a bar's payments by status, newest or oldest first.
- Restrict confirmed payment reads to a report or cash-session date range.
- Load POS pending customer payment requests from only the last 30 minutes without loading confirmed/rejected history.

The shared serializer generates GSI4 keys for `CustomerPaymentRequest` records. Since status is part of the partition key, status updates move the record to the matching status partition on save. `queryPaymentRequestsByBarStatus(barId, status, options)` reads this index.

Existing payment records can be indexed with:

```powershell
node scripts/backfillPaymentGsi4.js --apply --page-size=100 --concurrency=5
```

The backfill is dry-run by default. Add `--apply` only after GSI4 is `ACTIVE`.

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
- Confirmed customer payments are queried through GSI4 for the selected report date range.

The Customers page retrieves full settlement history by querying GSI4's known status partitions and merging the results when the customer list is reset. Cursor-page loads do not refetch settlements. The payment read remains not time-bounded; GSI4 is not customer-partitioned, so filtering by customer still occurs after the bar/status query.

Pending customer payment requests expire 30 minutes after creation. POS queries that window; stale requests are rejected as expired if a confirmation/rejection is attempted, and full payment lists expose their effective status as `expired`.

## Write-path behavior

Order creation and updates use the shared serializer in `lib/dynamodb.js`. It creates GSI1 keys for orders and inventory adjustments, and creates GSI2/GSI3 keys only for eligible active unpaid credit orders. Payment records receive GSI4 keys for their current status. Re-saving records rebuilds their index attributes, moving payments between GSI4 status partitions when their status changes.
