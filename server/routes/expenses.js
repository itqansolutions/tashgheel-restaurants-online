const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// GET /api/expenses
router.get('/', async (req, res) => {
    try {
        const { tenantId } = req;
        const { from, to, category, branchId: queryBranchId } = req.query;

        const filter = { tenantId };
        
        // Use queryBranchId if 'all' isn't requested, or fallback to session branchId
        if (queryBranchId && queryBranchId !== 'all') {
            filter.branchId = queryBranchId;
        } else if (req.branchId && queryBranchId !== 'all') {
            filter.branchId = req.branchId;
        }

        if (from || to) {
            filter.date = {};
            if (from) filter.date.gte = new Date(from);
            if (to) filter.date.lte = new Date(to);
        }

        if (category) filter.category = category;

        const expenses = await prisma.expense.findMany({
            where: filter,
            orderBy: { date: 'desc' }
        });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/expenses
router.post('/', async (req, res) => {
    try {
        const { description, amount, date, seller, method, notes, category } = req.body;
        const { branchId, tenantId, username } = req; // auth middleware sets req.username

        if (!description || !amount || !date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const expense = await prisma.expense.create({
            data: {
                description,
                amount: parseFloat(amount),
                date: new Date(date),
                seller,
                method,
                notes,
                category,
                tenantId,
                branchId,
                createdBy: username || 'system'
            }
        });

        res.status(201).json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { branchId, tenantId } = req;

        const expense = await prisma.expense.findUnique({ where: { id } });
        if (!expense || expense.tenantId !== tenantId || expense.branchId !== branchId) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        await prisma.expense.delete({ where: { id } });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
