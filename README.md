# ♠♥♦♣ Home Game

A free poker home game tracker. Track buy-ins, rebuys, cash-outs, and settle up at the end of the night.

**[Try it live →](https://homegame-eight.vercel.app)**

## What It Does

- **Track buy-ins & rebuys** during a live session
- **Cash out players** with a built-in calculator
- **Optimized settlements** — calculates the minimum number of payments to settle up
- **Leaderboard** — lifetime stats, win rates, ROI across all sessions
- **Player profiles** — session history, streaks, head-to-head records, profit-over-time chart
- **Session notes** — record memorable hands and moments
- **Data export/import** — backup and restore your data as JSON
- **Works offline** — PWA that runs from your home screen like a native app

## How to Use

1. Open [homegame-eight.vercel.app](https://homegame-eight.vercel.app) on your phone
2. Tap **Share → Add to Home Screen** (Safari on iPhone, Chrome on Android)
3. Open from your home screen
4. Tap **Start New Game** and add players as they sit down

No login. No account. No ads. Your data stays on your device.

## Screenshots

_Coming soon — use it at your next poker night and screenshot the settlement!_

## Tech

- React (single-component PWA)
- Vite + vite-plugin-pwa
- localStorage for persistence
- No backend, no database, no server
- Hosted free on Vercel

## Privacy

All data is stored locally on your device. Nothing is collected, transmitted, or tracked. See [privacy policy](https://homegame-eight.vercel.app/privacy.html).

## Disclaimer

Home Game is a tracking tool for friendly poker games. It does not facilitate gambling, process payments, or handle real money. Users are responsible for ensuring compliance with local laws.

## Version History

| Version | Date       | Changes |
|---------|------------|---------|
| v1.9    | 2026-02-16 | Undo rebuy, numeric keyboard on mobile, safe area support, number input cleanup, remove duplicate font load |
| v1.8    | 2026-02-15 | Disclaimer, data export/import, Greenfield Studio branding, localStorage for PWA |
| v1.7    | 2026-02-14 | Bug fixes: profile navigation, SVG IDs, history card colors |
| v1.6    | 2026-02-14 | Input validation, toast cleanup, settlement view fix |
| v1.5    | 2026-02-14 | Initial PWA deployment |

## License

This project is private. All rights reserved.

---

Built by **Greenfield Studio** · [GreenfieldStudio@pm.me](mailto:GreenfieldStudio@pm.me)
