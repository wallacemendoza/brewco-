const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/menu
router.get('/menu', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM menu ORDER BY category, id');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/orders — owner dashboard
router.get('/orders', async (req, res) => {
  try {
    const { rows: orders } = await pool.query(`
      SELECT o.*, 
        json_agg(json_build_object(
          'name', oi.name, 'quantity', oi.quantity, 'price', oi.price
        )) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats — today's revenue
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status != 'cancelled')         AS total_orders,
        COUNT(*) FILTER (WHERE status = 'pending')            AS pending,
        COUNT(*) FILTER (WHERE status = 'preparing')          AS preparing,
        COUNT(*) FILTER (WHERE status = 'delivered')          AS delivered,
        COALESCE(SUM(total) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND status != 'cancelled'), 0) AS revenue_today
      FROM orders
    `);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/orders — place order (customer)
router.post('/orders', async (req, res) => {
  const { customer, note, items } = req.body;
  if (!customer || !items?.length) {
    return res.status(400).json({ error: 'customer and items are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const { rows } = await client.query(
      'INSERT INTO orders (customer, note, total) VALUES ($1, $2, $3) RETURNING id',
      [customer, note || null, total]
    );
    const orderId = rows[0].id;
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, menu_id, name, price, quantity) VALUES ($1,$2,$3,$4,$5)',
        [orderId, item.id, item.name, item.price, item.quantity]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ order_id: orderId, message: 'Order placed!', total });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id — update status (owner)
router.patch('/orders/:id', async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }
  try {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
