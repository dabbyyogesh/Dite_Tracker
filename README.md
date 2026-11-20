# 🍽️ Hostel Diet & Snack Tracker

> Track daily hostel mess diets (**Lunch** & **Night**), **Wednesday Special Diets**, and **snack expenses (₹)**—with live editable rates, `.TXT` bill exports, and **Firebase Firestore** cloud sync.

## Overview

Keeping track of monthly hostel mess bills and canteen snacks on paper is easy to mess up. **Hostel Diet & Snack Tracker** gives you a clean calendar-based ledger that enforces the 2-diet daily limit (**Lunch** and **Night**), unlocks **Special Diets** automatically on **Wednesdays**, lets you adjust diet prices anytime, and exports a clean `.TXT` expense sheet whenever you need to verify your mess bill.

## Key Features

- **Interactive Monthly Calendar** — Browse any month or year with color-coded daily badges for Simple Diets (`S`), Special Diets (`Sp`), and Snacks (`₹`), plus a live monthly KPI bar.
- **2-Diet Daily Tracking (Lunch & Night)** — Toggle **Lunch Diet** and **Night Diet** independently on any day, with **Special Diet** appearing automatically on Wednesdays.
- **Live Rate Controls** — Edit **Simple ₹** and **Special ₹** rates right inside the day panel and watch daily and monthly totals update immediately.
- **Fast Snack Ledger (₹)** — Tap `+₹10`, `+₹20`, `+₹30`, `+₹50`, or `+₹100` for quick entries, or add custom amounts with item notes (e.g., *Chai*, *Maggi*).
- **`.TXT` Expense Export** — Generate, copy, or download a formatted plain-text report for a full month or any custom date range, with **Total Amount** shown at both the top and bottom.
- **Firebase Cloud Sync + Offline Cache** — Automatically saves to **Cloud Firestore** across devices and falls back to `localStorage` when offline.

## Daily Rules at a Glance

| Day Type | Lunch Diet | Night Diet | Snacks (₹) |
| :--- | :--- | :--- | :--- |
| **Regular Days** (Sun–Tue, Thu–Sat) | `Off` / `Simple` | `Off` / `Simple` | Unlimited entries |
| **Wednesdays** | `Off` / `Simple` / `Special` | `Off` / `Simple` / `Special` | Unlimited entries |

## Project Structure

```text
hostel-diet-tracker/
├── index.html   # Calendar UI, day editor, and modals
├── style.css    # Typography, responsive calendar cells, and scrollbar styling
└── app.js       # State management, .TXT report generator, and Firestore sync
```

## Quick Setup

1. **Clone the repo**
   ```bash
   git clone [https://github.com/](https://github.com/)<your-username>/hostel-diet-tracker.git
   cd hostel-diet-tracker
   ```

2. **Connect Firebase Firestore**
   - Create a project in the [Firebase Console](https://console.firebase.google.com/) and enable **Build → Firestore Database**.
   - Paste your `firebaseConfig` object at the top of `app.js`.

3. **Run the app**
   - Open `index.html` directly in your browser, **or** serve locally with VS Code **Live Server** / `python -m http.server 8000`.
   - Once connected, the header badge updates from **Local Storage** to **Firebase Synced**.
