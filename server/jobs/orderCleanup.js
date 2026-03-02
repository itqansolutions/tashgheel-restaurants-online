/**
 * Order Inactivity Cleanup Job
 *
 * Runs every 10 minutes. Finds open orders that:
 *  - Are NOT locked (not being processed by cashier)
 *  - Have no active kitchen items (nothing sent/preparing)
 *  - Have had no activity for 30+ minutes
 *
 * These are "ghost" orders — customer scanned QR but left without ordering.
 * Frees the table so it shows as available again.
 */

const Order = require('../models/Order');
const Table = require('../models/Table');

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const JOB_INTERVAL_MS = 10 * 60 * 1000;        // Run every 10 minutes

async function runCleanup() {
    try {
        const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS);

        // Uses the compound index: { status, isLocked, hasActiveKitchenItems, lastActivityAt }
        // isLocked: false is a CRITICAL safety guard — never cancel an order the cashier is closing right now
        const ghostOrders = await Order.find({
            status: 'open',
            isLocked: false,                   // ⚠️ Safety guard: never touch orders being closed by cashier
            hasActiveKitchenItems: false,       // No sent/preparing items
            lastActivityAt: { $lt: cutoff }
        }).select('_id tableId tenantId branchId tableName').lean();

        if (ghostOrders.length === 0) return;

        console.log(`[DINE_IN] CLEANUP_START count=${ghostOrders.length} cutoff=${cutoff.toISOString()}`);

        for (const order of ghostOrders) {
            try {
                // Cancel the order (double-check status to prevent TOCTOU race)
                const result = await Order.updateOne(
                    { _id: order._id, status: 'open', isLocked: false },
                    { status: 'cancelled', closedAt: new Date() }
                );

                if (result.modifiedCount === 0) {
                    // Was already closed/locked between our find and this update — skip safely
                    console.log(`[DINE_IN] CLEANUP_SKIP orderId=${order._id} reason=already_closed_or_locked`);
                    continue;
                }

                // Free the table
                await Table.updateOne(
                    { _id: order.tableId, activeOrderId: order._id },
                    { status: 'available', activeOrderId: null }
                );

                console.log(`[DINE_IN] CLEANUP_CANCEL orderId=${order._id} table=${order.tableName || order.tableId}`);
            } catch (e) {
                console.error(`[DINE_IN] CLEANUP_ERROR orderId=${order._id}`, e.message);
            }
        }
    } catch (err) {
        console.error('[DINE_IN] CLEANUP_JOB_ERROR', err.message);
    }
}

// Start the interval
setInterval(runCleanup, JOB_INTERVAL_MS);

// Also run once shortly after startup (with a delay to avoid blocking startup)
setTimeout(runCleanup, 30 * 1000);

console.log('🧹 Order cleanup job started (runs every 10 min, cancels ghost orders after 30 min inactivity)');

module.exports = { runCleanup };
