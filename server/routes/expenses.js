const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');

// Middleware to ensure authentication and branch context
// Assumes auth middleware (req.user) and branch middleware (req.branchId) are applied in index.js

// GET /api/expenses
router.get('/', async (req, res) => {
    try {
        const { branchId, tenantId } = req;
        const { from, to, category } = req.query;

        const query = { tenantId, branchId };

        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = from;
            if (to) query.date.$lte = to;
        }

        if (category) query.category = category;

        const expenses = await Expense.find(query).sort({ date: -1, createdAt: -1 });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/expenses
router.post('/', async (req, res) => {
    try {
        const { description, amount, date, seller, method, notes, category } = req.body;
        const { branchId, tenantId, user } = req;

        if (!description || !amount || !date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const expense = new Expense({
            description,
            amount,
            date,
            seller,
            method,
            notes,
            category,
            tenantId,
            branchId,
            createdBy: user ? user.username : 'system'
        });

        await expense.save();
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

        const deleted = await Expense.findOneAndDelete({ _id: id, tenantId, branchId });

        if (!deleted) return res.status(404).json({ error: 'Expense not found' });

        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
