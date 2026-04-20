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

const prisma = require('../prisma');

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const JOB_INTERVAL_MS = 10 * 60 * 1000;        // Run every 10 minutes

async function runCleanup() {
    try {
        const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS);

        // Finds ghost orders: open, not locked, no active kitchen items
        const ghostOrders = await prisma.order.findMany({
            where: {
                status: 'open',
                isLocked: false,
                hasActiveKitchenItems: false,
                lastActivityAt: { lt: cutoff }
            },
            select: { id: true, tableId: true, tenantId: true, branchId: true, tableName: true }
        });

        if (ghostOrders.length === 0) return;

        console.log(`[DINE_IN] CLEANUP_START count=${ghostOrders.length} cutoff=${cutoff.toISOString()}`);

        for (const order of ghostOrders) {
            try {
                // Cancel the order. If TOCTOU happens, it might fail if updated meanwhile.
                // We double-check in where clause.
                const updatedOrder = await prisma.order.updateMany({
                    where: { id: order.id, status: 'open', isLocked: false },
                    data: { status: 'cancelled', closedAt: new Date() }
                });

                if (updatedOrder.count === 0) {
                    console.log(`[DINE_IN] CLEANUP_SKIP orderId=${order.id} reason=already_closed_or_locked`);
                    continue;
                }

                // Free the table
                if (order.tableId) {
                    await prisma.table.updateMany({
                        where: { id: order.tableId, activeOrderId: order.id },
                        data: { status: 'available', activeOrderId: null }
                    });
                }

                console.log(`[DINE_IN] CLEANUP_CANCEL orderId=${order.id} table=${order.tableName || order.tableId}`);
            } catch (e) {
                console.error(`[DINE_IN] CLEANUP_ERROR orderId=${order.id}`, e.message);
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
