# Tashgheel Restaurants Online — System Documentation

**Version:** 2.0.0
**Date:** 2026-02-11
**Architecture:** Multi-Tenant SaaS with Hybrid Offline/Online Capabilities

---

## 1. Code Structure

The application is structured as a **Monolithic Node.js Application** serving a **Vanilla JavaScript SPA (Single Page Application)** frontend.

### Directory Overview
*   **Root**: Static HTML files (pages) and configuration.
*   **`/server`**: Backend Node.js/Express API.
    *   **`/models`**: Mongoose Schemas (MongoDB Data Models).
    *   **`/routes`**: API Route Handlers.
    *   **`/middleware`**: Auth, Rate Limiting, Tenant Scope.
    *   **`/utils`**: Helper functions (PDF generation, storage wrappers).
    *   **`/aggregators`**: External Food Aggregator Integrations (Talabat, etc.).
*   **`/js`**: Frontend JavaScript logic.
    *   **Core**: `auth.js` (Security/Sync), `api-client.js` (HTTP Wrapper).
    *   **Controllers**: `pos-app.js`, `inventory-app.js`, `admin-app.js`, etc.
*   **`/css`**: Styling (Tailwind-based custom styles).

### Key Files & Purpose

| File | Purpose | Dependencies |
| :--- | :--- | :--- |
| **Backend** | | |
| `server/server.js` | Entry point. Express app setup, DB connection, Middleware. | `express`, `mongoose`, `cors` |
| `server/routes/api.js` | Business logic endpoints (Sales, Inventory, Shifts). | `Sale`, `ProductStock`, `Shift` models |
| `server/routes/auth.js` | Tenant registration, Login, JWT issuance. | `User`, `Tenant`, `bcrypt`, `jwt` |
| `server/middleware/auth.js` | Verifies JWT, extracts `tenantId` & `userId`. | `jsonwebtoken` |
| **Frontend** | | |
| `index.html` | Login & Landing page. | `js/auth.js` |
| `pos.html` | Main Point of Sale Interface. | `js/pos-app.js`, `js/auth.js` |
| `js/auth.js` | **Critical**. Handles Login, Offline Sync, License Validation, Data Seeding. | None (Core) |
| `js/pos-app.js` | POS logic (Cart, Calculations, Checkout, Receipts). | `js/web-adapter.js` |
| `js/web-adapter.js` | `window.apiFetch` wrapper. Auto-injects headers & handles token refresh. | `axios` (optional) or `fetch` |

---

## 2. Functionality & Workflows

### A. Point of Sale (POS)
*   **Workflow**:
    1.  **Branch Selection**: User selects active branch upon login.
    2.  **Open Shift**: Cashier must declare opening cash amount.
    3.  **Order Taking**: Select items → Add Modifiers/Add-ons → Select Order Type (Dine-in, Delivery, Takeaway).
    4.  **Checkout**: Process payment (Cash/Card).
    5.  **Completion**:
        *   Sale saved to DB.
        *   Stock deducted **atomically**.
        *   Receipt printed (browser print).
        *   Order sent to **Kitchen Display**.
*   **Features**: Discounting, Tax Toggling, Hold/Draft Order, Customer Selection.

### B. Inventory Management
*   **Stock Tracking**: Managed **per branch**.
*   **Stock Movement Types**:
    *   **Sale**: Automatic deduction based on Product + Ingredients (Recipe).
    *   **Restock**: Adding inventory (Purchase).
    *   **Waste**: Logging spoiled items (`POST /inventory/adjust`).
    *   **Transfer**: Moving stock between branches (`POST /inventory/transfer`).
*   **Audit**: Bulk stock count to reconcile physical vs. system stock.

### C. Kitchen Display System (KDS)
*   **Kitchen View**: shows orders with `kitchenStatus: 'pending'`.
*   **Real-time**: Polls backend for new orders.
*   **Action**: Chef clicks "Complete" → `POST /kitchen/complete` → Status updates to `'ready'`.

### D. Admin & Reporting
*   **Super Admin**: Manage Tenants (Create, Suspend, Subscription).
*   **Tenant Admin**: Manage Users, Branches, Products, Settings.
*   **Reports**:
    *   **Live Sales**: Real-time dashboard (`/reports/live`).
    *   **Sales History**: Filter by Date, Cashier, Status.
    *   **Shift Reports**: Cash reconciliation (Expected vs. Actual).

---

## 3. Logic & Architecture

### Authentication & Security
*   **JWT (JSON Web Token)**: Used for stateless authentication.
*   **Token Rotation**:
    *   `Access Token`: Short-lived (15m). Stored in HTTP-Only Cookie.
    *   `Refresh Token`: Long-lived (7d). Used to get new Access Token.
*   **Tenant Isolation**:
    *   Every Request **MUST** have `tenantId` (extracted from JWT).
    *   Middleware enforces `tenantId` on all DB queries. NO DATA LEAKAGE.

### Hybrid Offline/Online Sync (`js/auth.js`)
*   **Startup**: Checks API connection.
*   **Data Loading**:
    *   **Critical Batch**: Users, Products, Settings (Blocks UI).
    *   **Background Batch**: History, Old Reports (Loads asynchronously).
*   **Storage**: Uses Browser `localStorage` as a fast cache `window.DataCache`, synced with Server.
*   **License**: Validates machine fingerprint against encrypted license key (Anti-piracy).

### Stock Engine Logic
*   **Recipe Support**: A Product (e.g., "Burger") works as a "Composite".
    *   Selling 1 Burger deducts: 1 Bun, 1 Patty, 0.05kg Lettuce (defined in `ingredients`).
    *   If no recipe, it deducts the Product itself (Direct Stock).
*   **Atomic Transactions**: Sales deduct stock immediately.
    *   **Rollback**: If stock deduction fails (e.g., DB error), the Sale is deleted and any partial deductions are reversed.

---

## 4. Data Storage (MongoDB Schemas)

### A. Core Entities

#### **Tenant** (`tenants`)
Represents the business subscribing to the SaaS.
```javascript
{
  _id: ObjectId,
  businessName: String,
  email: String, // Unique Login Identifier
  status: 'active' | 'suspended',
  subscriptionPlan: String,
  settings: { taxRate: Number, currency: String }
}
```

#### **Branch** (`branches`)
Physical locations.
```javascript
{
  _id: ObjectId,
  tenantId: ObjectId, // Partition Key
  name: String,
  code: String, // Unique within Tenant
  address: String
}
```

#### **User** (`users`)
System operators.
```javascript
{
  _id: ObjectId,
  tenantId: ObjectId,
  username: String,
  passwordHash: String,
  role: 'admin' | 'manager' | 'cashier' | 'chef' | 'driver',
  branchIds: [ObjectId], // Access Control
  defaultBranchId: ObjectId
}
```

### B. Operational Data

#### **Product Stock** (`product_stocks`)
The ledger of current quantity.
```javascript
{
  tenantId: ObjectId,
  branchId: ObjectId, // Stock is Branch-Specific
  productId: String,
  qty: Number
}
```

#### **Sale** (`sales`)
The transaction record.
```javascript
{
  tenantId: ObjectId,
  branchId: ObjectId,
  receiptNo: String,
  date: Date,
  total: Number,
  kitchenStatus: 'pending' | 'ready', // KDS Workflow
  status: 'finished' | 'void' | 'refunded',
  items: [
    { id: String, name: String, qty: Number, price: Number, cost: Number, addons: [] }
  ]
}
```

#### **Inventory Adjustment** (`inventory_adjustments`)
Audit trail for ALL stock changes.

#### **Shift** (`data_shifts`)
Cash drawer sessions.
```javascript
{
  tenantId: ObjectId,
  branchId: ObjectId,
  cashierId: ObjectId,
  openingCash: Number,
  closingCash: Number,
  expectedCash: Number,
  difference: Number, // Overage/Shortage
  status: 'open' | 'closed' | 'force-closed',
  totals: {
    cashTotal: Number,
    cardTotal: Number,
    mobileTotal: Number,
    totalSales: Number,
    voidsCount: Number,
    voidsValue: Number
  },
  openedAt: Date,
  closedAt: Date
}
```

#### **Daily Summary** (`daily_summaries`)
Aggregated stats for reporting.
```javascript
{
  tenantId: ObjectId,
  branchId: ObjectId,
  date: String, // 'YYYY-MM-DD' (Local Branch Time)
  totalRevenue: Number,
  totalOrders: Number,
  totalDiscount: Number,
  totalTax: Number,
  totalCost: Number,
  cashTotal: Number,
  cardTotal: Number,
  mobileTotal: Number,
  voidsCount: Number,
  voidsValue: Number
}
```

#### **Tax** (`taxes`)
Configurable tax rates.
```javascript
{
  name: String, // e.g., "VAT"
  percentage: Number, // e.g., 14
  enabled: Boolean,
  orderTypes: ['dine_in', 'take_away', 'delivery'], // Scope
  branchId: String // Optional
}
```

#### **Expense** (`expenses`)
Petty cash and vendor payments.
```javascript
{
  tenantId: String,
  branchId: String,
  description: String,
  amount: Number,
  date: String,
  category: String,
  type: 'expense' | 'vendor_payment',
  itemized: Boolean // Future: Link to specific receipt items?
}
```

#### **Audit Log** (`audit_logs`)
Security and compliance trail.
```javascript
{
  tenantId: ObjectId,
  branchId: ObjectId,
  userId: ObjectId,
  action: String, // e.g., 'SALE_REFUND', 'LOGIN'
  details: Object, // Flexible payload
  ipAddress: String,
  timestamp: Date
}
```

#### **Aggregator Order** (`aggregator_orders`)
Orders from external platforms (Talabat, etc.).
```javascript
{
  provider: 'talabat' | 'uber_eats' | 'careem',
  providerOrderId: String,
  tenantId: ObjectId,
  branchId: ObjectId,
  status: 'pending' | 'accepted' | 'ready' | 'rejected',
  rawPayload: Object, // Full JSON from provider
  mappedSaleId: String, // ID of local Sale record once processed
  financials: {
    total: Number,
    fees: { commission: Number, delivery: Number }
  }
}
```


---

## 5. Data Flow Example: Inventory Transfer

**Scenario**: Transfer 10 Coca Cola from Branch A to Branch B.

1.  **Frontend Request**:
    *   `POST /api/inventory/transfer`
    *   Body: `{ itemId: "coke_123", targetBranchId: "Branch_B", qty: 10 }`
    *   Header: `x-branch-id: "Branch_A"` (Source)

2.  **Backend Logic**:
    *   **Validation**: Check Branch A has >= 10 Coke.
    *   **Generate Ref**: `TRF-1739274...`
    *   **Docs Created**:
        1.  `InventoryAdjustment` (Type: `TRANSFER_OUT`, Qty: -10, Branch: A, Ref: TRF...)
        2.  `InventoryAdjustment` (Type: `TRANSFER_IN`, Qty: +10, Branch: B, Ref: TRF...)
    *   **Stock Update**:
        1.  `ProductStock` (Branch A, Coke) -> Decrement 10.
        2.  `ProductStock` (Branch B, Coke) -> Increment 10 (Upsert if missing).
    *   **Audit**: `AuditLog` entry created.

3.  **Response**:
    *   `{ success: true, referenceId: "..." }`

---

## 6. Reporting Logic

### Live Sales Report
*   **Endpoint**: `/api/reports/live`
*   **Logic**:
    *   Filter `sales` by `tenantId`, `branchId` and `date >= Today 00:00`.
    *   Aggregate: `Sum(total)` as Revenue, `Count(_id)` as Orders.

### Sales History
*   **Endpoint**: `/api/reports/history`
*   **Logic**:
    *   Complex Filter: Date Range (`$gte`, `$lte`), Cashier, Status.
    *   Pagination: `skip`, `limit`.
    *   Summary Header: Aggregation to show Totals (Cash, Card, Discount) for the *entire* filtered set, not just the current page.

---

## 7. API Reference

All endpoints start with `/api`.
headers: `x-auth-token` (or Cookie), `x-branch-id` (for branch-scoped ops).

### Authentication
*   `POST /auth/login`: Email/User/Pass -> Returns User + Cookies.
*   `POST /auth/register`: New Tenant signup.
*   `GET /auth/me`: Validate session & get user data.
*   `GET /auth/refresh`: Rotate access token.

### Data & Sync
*   `POST /data/save`: Save generic data key (Legacy/Sync).
*   `GET /data/read/:key`: Read generic data key (Filtered by Branch).
*   `GET /data/list`: List available data files.

### POS & Sales
*   `POST /sales`: Create Sale (Trigger stock deduction).
*   `POST /sales/refund/:id`: Refund sale (Trigger stock restore).
*   `GET /kitchen/orders`: List pending KDS orders.
*   `POST /kitchen/complete/:id`: Mark order ready.

### Inventory
*   `POST /inventory/adjust`: Manual Adjustment (Waste/Damage).
*   `POST /inventory/transfer`: Inter-branch transfer.
*   `POST /inventory/set`: Absolute stock override (Audit).

### Admin
*   `GET /super-admin/tenants`: List all tenants (Super Admin).
*   `POST /branches`: Create Branch.
*   `POST /shifts/open`: Open Shift.
*   `POST /shifts/close`: Close Shift.

---

## 8. User Roles & Permissions

| Role | Access Level |
| :--- | :--- |
| **Super Admin** | **System God Mode**. Can create/delete Tenants. No access to Tenant Data. |
| **Admin** | **Tenant Owner**. Full access to all Branches, Settings, Users, Reports. |
| **Manager** | **Branch Lead**. Access to specified Branches. Can manage Inventory, Shifts, Returns. |
| **Cashier** | **POS Operator**. Can Open/Close Shift, create Sales. Restricted from Settings/Reports. |
| **Chef** | **KDS Operator**. Access to Kitchen Display only. |
| **Driver** | **Delivery**. View assigned delivery orders (Future feature). |

---

**End of Documentation**
