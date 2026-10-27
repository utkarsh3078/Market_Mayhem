# Market Mayhem: pitch slides and speaker notes

Six slides, under 2 minutes of speaking before the live demo. Each slide has at most three bullets; the notes are what you say.

---

## 1. The problem

- Most people learn about markets from headlines, after the move has happened.
- Real information is uneven: some people know more, sooner, and some of what they "know" is wrong.
- Reading about this doesn't build the instinct for it.

**Notes (~40 words):** Everyone has heard "buy the rumor, sell the news", but almost nobody has felt it. Markets punish people who react to headlines and reward people who ask what is already priced in. That lesson is hard to teach from a textbook.

---

## 2. The solution

- A multiplayer trading game played in 5-minute rounds, with virtual credits only.
- Everyone sees the same news; each player also gets a different private clue, which may be wrong.
- When the bell rings, a hidden event resolves and the results explain why each price moved.

**Notes (~40 words):** Market Mayhem turns that lesson into a game you play with friends. You trade five fictional companies, weigh public headlines against your own private clue, and at the end you see exactly who knew what and why the market moved.

---

## 3. What's new

- Social deduction meets trading: your edge is information that nobody else has.
- Every scenario is balanced: acting on a solid clue beats chasing headlines, and a false rumor doesn't pay.
- The debrief reveals every player's clue, so the lesson lands immediately.

**Notes (~40 words):** The private clue is the core idea. It makes every player's experience different, and it makes judgment matter more than speed. We check the balance automatically: in every scenario, the headline chaser loses to the player who used a good clue.

---

## 4. How it's built

- Next.js web app and a Node game server, connected over WebSockets.
- The server is authoritative: it validates every trade and sets every price; clues only ever go to their owner.
- Deterministic, seeded markets; optional Supabase persistence and an optional AI round summary.

**Notes (~40 words):** The browser only sends intent; the server decides prices, fees and validity, so nobody can cheat. The same seed always produces the same market, which makes rounds fair and testable. Fifty-nine automated tests cover trading, privacy, balance and failure cases.

---

## 5. Impact

- A 5-minute, no-risk way to build intuition about information, rumors and timing.
- Works for classrooms, clubs and friends: anyone with a browser and a room code can join.
- New scenarios are a single config file, so teachers can write their own lessons.

**Notes (~40 words):** The audience is anyone curious about markets who isn't ready to risk real money: students, clubs, first-time investors. Because scenarios are plain config files with automatic checks, adding a new lesson is cheap. Now let us show you a round.

---

## 6. Live demo

- Two players, one room, The Energy Shock.

**Notes:** Hand over to the demo script ([demo-script.md](demo-script.md)).

---

*Fictional educational simulation. Not financial advice.*
