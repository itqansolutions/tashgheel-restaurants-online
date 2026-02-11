# Tashgheel Restaurants Online — System Audit Checklist

**Date:** 2026-02-11
**Version:** 1.0.0
**Auditor:** ____________________

---

## 1. Authentication & Security

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Login** | Attempt login with valid credentials (Admin). | Successful redirect to Dashboard/POS. JWT Token stored in HTTP-Only Cookie. | `admin` / `password123` |
| **Login** | Attempt login with invalid credentials. | Error message: "Invalid Credentials". No token issued. | |
| **Multi-Tenancy** | Login as Tenant A, try to access Tenant B's data via ID manipulation. | Access Denied (403/404). Data isolation verified. | `tenantId` mismatch |
| **Session** | Refresh page after 10 minutes. | User remains logged in (Silent Refresh). | |
| **Logout** | Click Logout. | Redirect to Login. Cookies cleared. Back button should not restore session. | |
| **License** | Check License Status in Console/Settings. | Status: "Activated". Machine Fingerprint matches. | |

## 2. Point of Sale (POS) & Sales

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Load** | Open POS page. | Products, Categories, and Cart load successfully. | |
| **Search** | Search by Name, Barcode. | Correct products filtered instantly. | `Coca Cola`, `123456...` |
| **Cart** | Add Item, Change Qty (Increase/Decrease). | Subtotal updates correctly. | Item Price x Qty |
| **Modifiers** | Add Item with Add-ons (e.g., Extra Cheese). | Cart shows item + add-ons. Price includes add-on cost. | |
| **Tax** | Toggle Tax (VAT 14%). | Tax calculated on subtotal. Grand Total updates. | `100 + 14 = 114` |
| **Order Type** | Switch between Dine-in / Takeaway / Delivery. | Delivery fees applied/removed. Table selection shown for Dine-in. | |
| **Checkout** | Complete Sale (Cash). | Success Toast. Receipt Prints. Cart Clears. | |
| **Stock** | **CRITICAL**: Check stock before & after sale. | Stock reduced by EXACT quantity sold. | `Start: 50` -> `Sold: 2` -> `End: 48` |
| **Receipt** | Verify printed receipt details. | Includes: Business Name, Logo, Receipt#, Date, Items, Tax, Total, Footer. | |

## 3. Inventory Management

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Recipe** | Sell composite item (e.g., Burger). | Ingredients deducted (Bun, Patty, Lettuce). | `Burger` -> `-1 Bun`, `-1 Patty` |
| **Adjust** | Perform "Waste" adjustment. | Stock decreases. `InventoryAdjustment` record created with reason. | `Rotten Tomato`, `-5kg` |
| **Transfer** | Transfer Stock Branch A -> Branch B. | Branch A Stock decreases. Branch B Stock increases. Audit log created. | `Ref: TRF-...` |
| **Audit** | Perform Bulk Stock Audit (Set Absolute Qty). | Stock updated to counted value. Difference logged as adjustment. | `Count: 20` (prev 25) -> `-5 adj` |
| **History** | View Inventory History for an item. | Shows chronological list of Sales, Restocks, Waste, Transfers. | |

## 4. Shifts & Cash Management

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Open** | Open Shift with Opening Cash. | Shift Status: 'Open'. Start Time recorded. | `Opening: 500.00` |
| **Transact** | Make Cash Sale (100.00). | "Expected Cash" increases to 600.00. | |
| **Close** | Close Shift. Enter Closing Cash (600.00). | Shift Status: 'Closed'. Difference: 0.00. Report Generated. | |
| **Shortage** | Close Shift with less cash (590.00). | Difference: -10.00. Highlighted in Red. Note required. | |
| **Lock** | Try to open POS without Open Shift. | Prompt to Open Shift appears. Cannot transact. | |

## 5. Reporting & Analytics

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Live** | Check Live Dashboard after Sale. | Total Revenue, Order Count increment immediately. | |
| **History** | Filter Sales History by "Today". | Shows recent transactions. Totals match actuals. | |
| **Refund** | Refund a transaction. | Status: 'Refunded'. Stock Restored. Revenue deducted in reports. | |
| **Summary** | Check End-of-Day Summary. | Matches Shift Report. Voids/Refunds accounted for correctly. | `DailySummary` collection |
| **Export** | Export Report (PDF/Excel). | File downloads. Data matches screen. | |

## 6. Hybrid Offline/Online Sync

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Offline** | Disconnect Internet. Reload Page. | App loads from Cache. Items visible. | `ServiceWorker` / `localStorage` |
| **Sync** | Reconnect Internet. | Background sync triggered (check console). New data fetched. | `BackgroundDataReady` event |
| **Resilience**| Login while server is slow/down. | UI should not freeze. Loading overlay handles timeout gracefully. | |

## 7. Roles & Permissions

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Cashier** | Try to access Settings/Admin. | Menu item hidden or Access Denied message. | |
| **Manager** | access Inventory & Shifts. | Access Granted. | |
| **Admin** | Create new User. | User created successfully. Can login immediately. | |
| **Delete** | Try to delete critical data (e.g., Sale) as Cashier. | Button hidden or Action blocked. | |

## 8. UI/UX & Branding

| Module | Check | Expected Result | Notes / Sample Data |
| :--- | :--- | :--- | :--- |
| **Logo** | Check Login, Navbar, Receipt. | Correct Business Logo displayed. High resolution. | |
| **Theme** | Check colors (Primary/Secondary). | Consistent across buttons, headers, links. | `Tailwind` config matches brand. |
| **Contact** | Check Receipt Footer. | Correct Address, Phone, Tax ID displayed. | |
| **Responsive**| Resize window / Mobile view. | Layout adjusts. No broken grids or unreadable text. | |
| **Feedback** | Perform action (Save/Delete). | Toast notification appears ("Saved Successfully"). | |

---

## 9. Additional Recommendations

*   **Stress Test**: rapid-fire 10 orders to ensure no stock race conditions.
*   **Timezone Check**: Verify receipt time matches local time exactly.
*   **Currency Format**: Ensure consistent decimal places (e.g., `10.00` vs `10`).
*   **Backup**: Verify "Download Backup" feature in Admin panel generates a valid JSON file.
