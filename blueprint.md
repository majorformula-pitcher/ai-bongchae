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
- **Multi-Feed Integration**: AI Feed (ETNews) and Robot Feed (RobotNews).
- **Core Insight Extraction (V4)**: 
  - Automatically identifies and extracts the most relevant 2-3 sentences from long news summaries.
  - Cleans news agency prefixes (e.g., [Seoul=...] ) for a cleaner reading experience.
- **Real-Time Updates**: Automatic background refresh every 1 minute with surgical UI updates.
- **RSS-to-JSON Pipeline**: Utilizing the `rss2json` API for robust data retrieval and CORS handling.

### 3. Implementation Details (V4 - Insights)
- **Extraction Heuristic**: `extractCoreInsight` function using regex-based sentence splitting and pattern cleaning.
- **State Management**: `lastFetchedIds` Set to track unique article IDs.
- **Responsive Grid**: Adaptive layout using CSS Grid with `minmax(320px, 1fr)`.

---

## Current Plan: Core Insight Extraction

### Step 1: Logic Implementation (`main.js`)
- Implement `extractCoreInsight(text)` to handle:
  - Removal of reporter/agency prefixes.
  - Splitting by sentence boundaries.
  - Joining the first 2-3 most relevant sentences.
- Integrate this function into the `renderItem` flow.

### Step 2: Verification
- Ensure summaries are now concise and start directly with the news content.
- Verify that agencies like "[서울=뉴시스]" are correctly filtered out.
- Confirm real-time updates still work with this extraction logic.
