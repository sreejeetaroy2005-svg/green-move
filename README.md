# 🌿 GreenMove — Carbon Reduction & Green Mobility Platform

> **Encourage, track, and reward low-carbon commuting habits across Bengaluru — verified on-chain, shared city-wide.**

GreenMove is a full-stack web platform that helps commuters log eco-friendly trips (walking, cycling, bus, metro, carpool), earn points and badges, and contribute to a city-level carbon reduction dashboard — all backed by a simulated blockchain ledger for tamper-proof verification.

---

## 🚀 Live Demo

| Role | URL | Credentials |
|---|---|---|
| Commuter | `http://localhost:3000/commuter.html` | `arjun@techcorp.com` / `password123` |
| Employer | `http://localhost:3000/employer.html` | `hr@techcorp.com` / `password123` |
| City Planner | `http://localhost:3000/analytics.html` | `planner@blr.gov.in` / `password123` |
| Blockchain Explorer | `http://localhost:3000/verify.html` | *(public, no login)* |

---

## ✨ Feature Highlights

### 🌍 Live Carbon Counter
The homepage displays a real-time animated ticker showing the total CO₂ avoided across Bengaluru today, pulling live data from the server every 10 seconds with a smooth counting animation and a pulsing green dot.

### ⛓️ Blockchain Explorer
Every trip logged is assigned a cryptographic transaction hash. Anyone can visit `/verify.html`, paste a hash, and see the full verified record — mode, distance, CO₂ saved, timestamp, and CO₂ equivalents. Shareable via direct URL.

### 🌳 CO₂ Equivalents Engine
Every trip is automatically converted into human-readable equivalents:
- 🌳 Trees planted
- 📱 Phone charges worth of energy
- 🚗 Car kilometres avoided
- ♻️ Plastic bottles recycled
- 💡 LED bulb hours

Shown in the commuter dashboard, WhatsApp bot replies, and employer certificates.

### 📜 Employer Carbon Certificate (PDF)
Employers can download a professionally formatted PDF certificate for any month showing their team's total CO₂ avoided, verified trip count, top 3 commuters, and CO₂ equivalents — generated on-demand via `pdfkit`.

### 🗺️ City Zone Green Score Map
The City Planner portal features an interactive Canvas 2D map of 12 Bengaluru zones, each colour-coded by total CO₂ saved (grey → light green → forest green). Hover over a zone to see its trips, CO₂, and top transport mode.

### 🛡️ Streak Shield
Commuters build daily streaks for logging trips. Every 7-day streak milestone earns **1 Streak Shield**, which automatically activates to protect the streak if a day is missed — so one off-day doesn't break the chain.

### 📸 WhatsApp Photo Proof
The WhatsApp bot accepts image messages with a caption (e.g., "cycled 8km"). Trips logged with a photo earn a **1.5× points multiplier** and are marked with a 📸 badge in trip history, providing incentive for honest reporting.

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express 5 |
| **Database** | SQLite (via `sqlite` + `sqlite3`) |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| **PDF Generation** | PDFKit |
| **Rate Limiting** | `express-rate-limit` |
| **Security** | `helmet`, CORS |
| **Scheduling** | `node-cron` |
| **Frontend** | Vanilla HTML/CSS/JS, Chart.js, Canvas 2D |

---

## 📁 Project Structure

```
green_move/
├── src/
│   ├── index.js          # App entry point & server setup
│   ├── db.js             # SQLite schema, migrations & connection
│   ├── carbon-engine.js  # CO₂ calculation + equivalents engine
│   ├── helpers.js        # Points, badges, streaks, tx hash
│   ├── seed.js           # Database seeding with realistic data
│   └── logger.js         # Structured logger
│
├── routes/
│   ├── auth.js           # Register, login, JWT
│   ├── trips.js          # Log trips, history, leaderboard, verify
│   ├── analytics.js      # City stats, zones, trends, PDF certificate
│   ├── rewards.js        # Points balance, redeem rewards, marketplace
│   ├── whatsapp.js       # WhatsApp bot webhook (NLP + photo proof)
│   ├── challenges.js     # Community challenges
│   └── planner.js        # City planner routes
│
├── middleware/
│   └── auth.js           # JWT middleware + role-based access
│
├── public/
│   ├── index.html        # Homepage with live carbon counter
│   ├── commuter.html     # Commuter dashboard
│   ├── employer.html     # Employer portal + certificate download
│   ├── analytics.html    # City planner analytics + zone map
│   ├── verify.html       # Blockchain explorer (public)
│   ├── bot-demo.html     # WhatsApp bot simulator
│   ├── css/style.css     # Design system (cream/forest green palette)
│   └── js/app.js         # Shared frontend utilities
│
├── .env.example          # Environment variable template
├── package.json
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites
- **Node.js** v18+ 
- **npm** v9+

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd green_move
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
JWT_SECRET=your-strong-secret-here
```

### 3. Seed the Database

Populates the SQLite database with employers, commuters, and sample trips across 12 Bengaluru zones.

```bash
node src/seed.js
```

**Test Accounts Created:**

| Role | Email | Password |
|---|---|---|
| Commuter | `arjun@techcorp.com` | `password123` |
| Employer | `hr@techcorp.com` | `password123` |
| City Planner | `planner@blr.gov.in` | `password123` |

### 4. Start the Server

```bash
node -r dotenv/config src/index.js
```

Open your browser at **http://localhost:3000**

---

## 🔌 API Reference

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive JWT |

### Trips
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/trips` | Commuter | Log a green trip |
| `GET` | `/api/trips/my` | Commuter | Paginated trip history |
| `GET` | `/api/trips/leaderboard` | Commuter | Top 5 city leaderboard |
| `GET` | `/api/trips/verify/:tx_hash` | Public | Verify a trip by hash |
| `POST` | `/api/trips/preview` | Commuter | Preview CO₂ before logging |
| `GET` | `/api/trips/impact` | Commuter | Total environmental impact |

### Analytics
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/analytics/city` | Planner | Citywide stats |
| `GET` | `/api/analytics/city/today` | Public | Today's live CO₂ counter |
| `GET` | `/api/analytics/zones` | Planner | Per-zone CO₂ breakdown |
| `GET` | `/api/analytics/trends` | Planner | Daily/weekly/monthly trends |
| `GET` | `/api/analytics/employer/:id` | Employer | Team stats |
| `GET` | `/api/employer/certificate/:id` | Employer | Download PDF certificate |

### Rewards
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/rewards/my` | Commuter | Points balance & stats |
| `POST` | `/api/rewards/redeem` | Commuter | Redeem a reward |

### WhatsApp Bot
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/whatsapp` | Webhook for text & photo messages |

**Text examples:** `"cycled 8km"`, `"bus 12km"`, `"my stats"`, `"leaderboard"`  
**Photo proof:** Send `type: "image"` with caption `"walked 3km"` → earns **1.5× points**

---

## 🎮 Gamification System

### Points Formula
```
Base Points = CO₂ saved (kg) × 100
Mode Bonus   = Walk/Cycle: +50% | Bus/Metro: +20% | Carpool: +10%
Streak Bonus = +5 pts per day of streak
```

### Badges (by total CO₂ saved)
| Badge | Threshold |
|---|---|
| 🌱 Seedling | 0 kg |
| 🌿 Green Commuter | 5 kg |
| 🌳 Eco Warrior | 20 kg |
| 🦋 Carbon Crusher | 50 kg |
| 🌍 Planet Champion | 100 kg |

### Streak Shields
- Log trips daily to build a streak 🔥
- Reach **7 days** → earn **1 Streak Shield** 🛡️
- A shield auto-activates if you miss a day — protecting your streak
- Shields are stackable

---

## 🌱 Carbon Calculation

CO₂ savings are calculated relative to a private petrol car (baseline: **192g CO₂/km**):

| Mode | Emission Factor | Typical Saving |
|---|---|---|
| 🚶 Walk | 0 g/km | 192g/km saved |
| 🚴 Cycle | 0 g/km | 192g/km saved |
| 🚌 Bus | 89g/km | 103g/km saved |
| 🚇 Metro | 41g/km | 151g/km saved |
| 🚗 Carpool (2 pax) | 96g/km | 96g/km saved |

---

## 🔒 Security

- All passwords hashed with **bcryptjs** (10 salt rounds)
- All protected endpoints require a valid **JWT Bearer token**
- Role-based access control: `commuter`, `employer`, `city_planner`
- Rate limiting on trip logging: **10 trips/day per user**
- HTTP security headers via **Helmet**

---

## 📐 Design System

| Token | Value |
|---|---|
| Background | `#F5F5F0` (Cream) |
| Primary | `#1A2E1A` (Forest Green) |
| Accent | `#97BC62` (Moss Green) |
| Amber | `#F59E0B` |
| Font | Calibri / system-ui |

---

## 🗺️ Bengaluru Zones Tracked

Whitefield · Electronic City · Koramangala · Indiranagar · HSR Layout · Sarjapur · Hebbal · Yeshwanthpur · JP Nagar · Bannerghatta · Yelahanka · Marathahalli

---

## 📄 License

ISC © GreenMove Team

---

> *Built for the **Carbon Reduction & Green Mobility** track — encouraging sustainable commuting through gamification, blockchain verification, and real-time city analytics.*
