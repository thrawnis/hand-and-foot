# Hand & Foot

A highly visual, real-time multiplayer web implementation of the card game Hand and Foot. Supports 2–8 players (in teams), spectators, reconnection, drag-and-drop card play, and a full admin panel.

## Quick Start (Docker — Recommended)

```bash
git clone https://github.com/thrawnis/hand-and-foot.git
cd hand-and-foot
git checkout claude/hand-foot-card-game-VF8Fb
cp .env.example .env
```

Edit `.env` and set a secure admin password:

```env
PORT=3001
ADMIN_PASSWORD=yourpassword
ADMIN_PATH=/admin
DB_PATH=/data/handf.db
```

Then start:

```bash
docker compose up -d
```

The app will be available at `http://your-server-ip:3001`.  
The admin panel is at `http://your-server-ip:3001/admin`.

To stop:

```bash
docker compose down
```

Game data (SQLite) is stored in a named Docker volume (`handf-data`) and persists across restarts.

---

## Local Development

**Requirements:** Node.js 20+

```bash
# Terminal 1 — Backend
cd server
npm install
npm run dev

# Terminal 2 — Frontend
cd client
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

---

## How to Play

1. Open the app and click **New Game**
2. Set player count (must be even), enter player names, configure rules
3. Share the 6-digit game code with other players — they visit the same URL and click **Join / Spectate**
4. Each player selects their name from the list to join
5. The game starts immediately after the host creates it

### Reconnecting

If you get disconnected, the browser will try to reconnect you automatically. If the game is still active you'll be prompted to rejoin. If you open the game on a second device/tab, you'll be asked whether to kick the old connection or stay on it.

---

## Game Rules (Defaults)

| Rule | Default |
|------|---------|
| Decks | Player count + 1 |
| Cards per hand / foot | 11 |
| Min cards per book | 7 |
| Clean books to go out | 2 |
| Dirty books to go out | 1 |
| Max wilds per dirty book | 2 |
| Clean book value | 500 pts |
| Dirty book value | 300 pts |
| Book of 3s bonus | 1,000 pts |
| Clean book of 7s bonus | 1,500 pts |
| Going out bonus | 100 pts |
| Rounds | 5 |
| Round thresholds | 50 / 100 / 150 / 200 / 250 |
| Red 3 penalty (if not in closed book) | −100 pts |
| Black 3 penalty (if not in closed book) | −50 pts |

### Card Point Values

| Cards | Points |
|-------|--------|
| Joker | 50 |
| 2 (wild), Ace | 20 |
| 10, J, Q, K | 10 |
| 3–9 | 5 |

All rules are configurable when creating a game.

---

## Admin Panel

Visit `/admin` and log in with the password set in `.env`.

- **Games** — view all active and archived games, archive or delete them
- **Rule Presets** — create named rule configurations that appear as quick-load options in the New Game wizard

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| State | Zustand |
| Animations | Framer Motion |
| Drag & Drop | dnd-kit |
| Real-time | Socket.io |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite (better-sqlite3) |
| Deployment | Docker, Docker Compose |
