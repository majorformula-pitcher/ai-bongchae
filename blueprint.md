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

### 2. Functional Features
- **Multi-Feed Integration**:
  - **AI Feed**: `https://rss.etnews.com/04046.xml`
  - **Robot Feed**: `https://www.irobotnews.com/rss/S1N1.xml`
- **Tab Switching Logic**: Dynamic feed loading based on the active tab (AI or Robot).
- **RSS-to-JSON Pipeline**: Utilizing the `rss2json` API for robust data retrieval and CORS handling.
- **Real-Time Polling**: Automatic refresh every 10 minutes.

### 3. Implementation Details (V2 - Multi-Tab)
- **Structure**: Updated `index.html` with a tab navigation container.
- **Styling**: New tab-specific styles in `style.css`.
- **Logic**: Updated `main.js` to manage multiple feed URLs and state-based rendering.

---

## Current Plan: Multi-Tab Refactor

### Step 1: UI Structure (`index.html`)
- Rename title to "Daily Insight".
- Add a `<nav>` element for the tabs.
- Ensure the news grid remains the main container for injected content.

### Step 2: Tab Styling (`style.css`)
- Style the tab bar with glassmorphism.
- Define active/hover states for tabs with a bottom-border glow.

### Step 3: Logic Refactor (`main.js`)
- Store multiple feed URLs in a config object.
- Implement tab switching logic that triggers `fetchNews()` with the corresponding URL.
- Maintain the `AINewsItem` component for consistent card rendering.

### Step 4: Verification
- Test switching between AI and Robot tabs.
- Ensure loading states are displayed correctly for each tab.
- Verify content accuracy from both feeds.
