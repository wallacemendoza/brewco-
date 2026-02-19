const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// BrewCo tables (separate from the restaurant schema)
const T_MENU = 'brewco_menu';
const T_ORDERS = 'brewco_orders';
const T_ITEMS = 'brewco_order_items';

let schemaReady = false;

// Creates BrewCo tables if missing and seeds brewco_menu from existing public.menu if available
async function ensureBrewcoSchema() {
  if (schemaReady) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${T_MENU} (
        id           SERIAL PRIMARY KEY,
        category     VARCHAR(50) NOT NULL,
        name         VARCHAR(100) NOT NULL,
        description  TEXT,
        price        NUMERIC(6,2) NOT NULL,
        emoji        VARCHAR(10) DEFAULT '☕'
      );

      CREATE TABLE IF NOT EXISTS ${T_ORDERS} (
        id          SERIAL PRIMARY KEY,
        customer    VARCHAR(100) NOT NULL,
        note        TEXT,
        status      VARCHAR(20) DEFAULT 'pending',
        total       NUMERIC(8,2) NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ${T_ITEMS} (
        id        SERIAL PRIMARY KEY,
        order_id  INT REFERENCES ${T_ORDERS}(id) ON DELETE CASCADE,
        menu_id   INT,
        name      VARCHAR(100) NOT NULL,
        price     NUMERIC(6,2) NOT NULL,
        quantity  INT NOT NULL
      );
    `);

    // If brewco_menu is empty, try seeding from existing "menu" table (restaurant schema)
    const { rowCount: hasBrewcoMenu } = await client.query(`SELECT 1 FROM ${T_MENU} LIMIT 1`);
    if (hasBrewcoMenu === 0) {
      // Does public.menu exist?
      const { rows: menuExistsRows } = await client.query(`
        SELECT to_regclass('public.menu') AS menu_table;
      `);

      const menuTableExists = !!menuExistsRows?.[0]?.menu_table;

      if (menuTableExists) {
        // Your existing menu table uses "description" (you renamed it already)
        // Copy it into brewco_menu
        await client.query(`
          INSERT INTO ${T_MENU} (category, name, description, price, emoji)
          SELECT category, name, description, price, COALESCE(emoji, '☕')
          FROM public.menu
          ORDER BY category, id;
        `);
      } else {
        // Fallback seed (only if no source menu exists)
        await client.query(`
          INSERT INTO ${T_MENU} (category, name, description, price, emoji) VALUES
          ('Hot Coffee',  'Espresso',        'Double shot, bold and intense',          3.50, '☕'),
          ('Hot Coffee',  'Cappuccino',      'Equal parts espresso, milk, foam',       4.50, '☕'),
          ('Cold Coffee', 'Cold Brew',       'Steeped 18hrs, smooth and strong',       5.50, '🧊'),
          ('Tea',         'Earl Grey',       'Classic bergamot black tea',             3.50, '🫖'),
          ('Food',        'Butter Croissant','Flaky, golden, fresh baked daily',       4.00, '🥐');
        `);
      }
    }

    await client.query('COMMIT');
    schemaReady = true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// GET /api/menu
router.get('/menu', async (req, res) => {
  try {
    await ensureBrewcoSchema();
    const { rows } = await pool.query(`SELECT * FROM ${T_MENU} ORDER BY category, id`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/orders (owner dashboard)
router.get('/orders', async (req, res) => {
  try {
    await ensureBrewcoSchema();
    const { rows: orders } = await pool.query(`
      SELECT
        o.*,
        COALESCE(
          json_agg(
            json_build_object(
              'name', oi.name,
              'quantity', oi.quantity,
              'price', oi.price
            )
            ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM ${T_ORDERS} o
      LEFT JOIN ${T_ITEMS} oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  try {
    await ensureBrewcoSchema();
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'cancelled') AS total_orders,
        COUNT(*) FILTER (WHERE status = 'pending')    AS pending,
        COUNT(*) FILTER (WHERE status = 'preparing')  AS preparing,
        COUNT(*) FILTER (WHERE status = 'ready')      AS ready,
        COUNT(*) FILTER (WHERE status = 'delivered')  AS delivered,
        COALESCE(
          SUM(total) FILTER (WHERE created_at::date = CURRENT_DATE AND status != 'cancelled'),
          0
        ) AS revenue_today
      FROM ${T_ORDERS}
    `);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/orders (customer places order)
router.post('/orders', async (req, res) => {
  const body = req.body || {};

  const customer =
    (typeof body.customer === 'string' && body.customer.trim()) ||
    (typeof body.name === 'string' && body.name.trim()) ||
    (typeof body.customerName === 'string' && body.customerName.trim()) ||
    '';

  const note = typeof body.note === 'string' ? body.note : '';
  const items = Array.isArray(body.items) ? body.items : [];

  if (!customer || items.length === 0) {
    return res.status(400).json({ error: 'customer and items are required' });
  }

  const client = await pool.connect();
  try {
    await ensureBrewcoSchema();
    await client.query('BEGIN');

    const total = items.reduce((sum, i) => {
      const price = Number(i.price) || 0;
      const qty = Number(i.quantity) || 0;
      return sum + price * qty;
    }, 0);

    const { rows } = await client.query(
      `INSERT INTO ${T_ORDERS} (customer, note, total)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [customer, note || null, total]
    );

    const orderId = rows[0].id;

    for (const item of items) {
      const menuId = item.menu_id ?? item.menuId ?? item.id ?? null;

      await client.query(
        `INSERT INTO ${T_ITEMS} (order_id, menu_id, name, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          orderId,
          menuId,
          String(item.name ?? ''),
          Number(item.price) || 0,
          Number(item.quantity) || 0
        ]
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

// PATCH /api/orders/:id (owner updates status)
router.patch('/orders/:id', async (req, res) => {
  const { status } = req.body || {};
  const valid = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];

  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  try {
    await ensureBrewcoSchema();
    await pool.query(`UPDATE ${T_ORDERS} SET status=$1 WHERE id=$2`, [status, req.params.id]);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
