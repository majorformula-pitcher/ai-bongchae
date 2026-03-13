# Daily Insight - Blueprint

## Overview
Daily Insight is a high-performance, multi-tab news dashboard that brings real-time insights into Artificial Intelligence and Robotics. It aggregates data from top-tier news sources (ETNews and RobotNews) to provide a centralized hub for modern technology enthusiasts.

## Project Vision
To become the primary dashboard for real-time tech news, offering a seamless, futuristic, and focused reading experience with a "Cyber/AI" aesthetic.

## Style, Design, and Features

### 1. Visual Design (Aesthetics)
- **Aesthetic**: Modern Tech/AI theme with dark mode by default.
- **Brand Name**: "Daily Insight"
- **Typography**: "Inter" (sans-serif) with bold headlines and responsive sizing.
- **Color Palette (OKLCH)**:
  - Background: `oklch(15% 0.02 240)` (Deep Space Blue)
  - Primary Accent: `oklch(65% 0.18 250)` (Deep AI Blue)
  - Secondary Accent: `oklch(85% 0.12 180)` (Cyber Cyan)
- **UI Components**:
  - **Tab Navigation**: Custom-styled navigation bar with active indicators and glow effects.
  - **Glassmorphism**: Translucent cards with `backdrop-filter: blur(10px)`.
  - **Interactive Glows**: Hover states with subtle glows and staggered animations.
  - **"NEW" Badge**: A vibrant gradient badge (`#ff4d4d` to `#f9cb28`) that appears on newly fetched articles in real-time.

### 2. Functional Features
- **Multi-Feed Integration**:
  - **AI Feed**: `https://rss.etnews.com/04046.xml`
  - **Robot Feed**: `https://www.irobotnews.com/rss/S1N1.xml`
- **Tab Switching Logic**: Dynamic feed loading based on the active tab (AI or Robot).
- **RSS-to-JSON Pipeline**: Utilizing the `rss2json` API for robust data retrieval and CORS handling.
- **Real-Time Updates (V3)**:
  - **Short Polling**: Automatic background refresh every 1 minute.
  - **Surgical Updates**: Newly detected articles are prepended to the current view without a full page reload or layout jump.
  - **Duplicate Detection**: Uses GUID/Link tracking to ensure only truly new content is added.

### 3. Implementation Details (V3 - Real-time)
- **State Management**: `lastFetchedIds` Set to track unique article IDs per category.
- **Silent Refresh**: `fetchNews` supports a `isSilent` mode to fetch updates in the background.
- **Dynamic Prepending**: Uses `container.insertBefore` to add new insights to the top of the grid.

---

## Current Plan: Real-time Update Refactor

### Step 1: Component Enhancement (`main.js`)
- Add `is-new` attribute support to `AINewsItem`.
- Define `.badge-new` styles in Shadow DOM.

### Step 2: Logic Refactor (`main.js`)
- Implement `lastFetchedIds` tracking.
- Update `fetchNews` to handle silent updates and identify new items.
- Create `renderItem` helper for consistent element creation.

### Step 3: Interval Update (`main.js`)
- Reduce `setInterval` from 10 minutes to 1 minute for a "live" feel.

### Step 4: Verification
- Verify that new items appear at the top with the "NEW" badge.
- Ensure tab switching still performs a clean, full reload.
- Confirm background updates don't trigger the loading spinner.
