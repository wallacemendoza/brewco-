# ☕ Brew & Co — Full-Stack Coffee Ordering Platform

> A production-ready coffee shop ordering system. Customers order online, the owner monitors and manages orders live.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Render-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Render](https://img.shields.io/badge/Deployed-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

## 🌐 Live URLs

**☕ Customer Ordering Page**  
https://brewco-1.onrender.com/

**📊 Owner Dashboard**  
https://brewco-1.onrender.com/dashboard

---

## What It Does

| Page | Who uses it | What it does |
|---|---|---|
| `/` | Customer | Browse menu, add items to cart, place an order |
| `/dashboard` | Owner | View live orders, update status, track revenue |

Orders show up on the dashboard automatically via polling.

---

## Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Render)
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no build step)
- **Real-time:** Polling
- **Deploy:** Render (single web service)

---

## Run Locally

```bash
git clone https://github.com/wallacemendoza/brewco.git
cd brewco
npm install
cp .env.example .env   # add your DATABASE_URL
npm run dev

```

---

## Deploy to Render

1. Push to GitHub
2. Render → **New → Web Service** → connect this repo
3. Set environment variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | Your Render PostgreSQL connection string |
| `NODE_ENV` | `production` |

4. Build: `npm install` · Start: `npm start`
5. Deploy — tables and menu are created automatically on first boot

---

## Project Structure

```
brewco/
├── public/
│   ├── index.html       # Customer ordering page
│   └── dashboard.html   # Owner live dashboard
├── src/
│   ├── server.js        # Express entry point
│   ├── db.js            # PostgreSQL pool + auto-setup
│   └── routes/
│       └── api.js       # GET /menu · POST /orders · PATCH /orders/:id · GET /stats
├── .env.example
├── .gitignore
└── package.json
```

## API

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/menu` | All menu items |
| `POST` | `/api/orders` | Place a new order |
| `PATCH` | `/api/orders/:id` | Update order status |
| `GET` | `/api/orders` | All orders (dashboard) |
| `GET` | `/api/stats` | Revenue + counts today |
