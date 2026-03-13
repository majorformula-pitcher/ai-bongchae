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
- **Core Insight Extraction (V6)**: 
  - **Full Article Fetching**: Asynchronously retrieves the complete HTML of news articles via a CORS proxy (`allorigins.win`).
  - **Paragraph-Specific Extraction**: Specifically targets and combines the **2nd and 3rd valid paragraphs** of the article content to provide high-quality context and detail.
  - **Content Parsing**: Utilizes DOM parsing and site-specific selectors to isolate the main article body and filter out noise (ads, captions).
  - **Dynamic Updates**: Initially displays RSS snippets, then smoothly updates to the specific paragraphs with a fade-in animation.
- **Real-Time Updates**: Automatic background refresh every 1 minute with surgical UI updates.
- **RSS-to-JSON Pipeline**: Utilizing the `rss2json` API for robust data retrieval and CORS handling.

### 3. Implementation Details (V6 - Content & Layout Optimization)
- **Card Dimensions**: Fixed height of `520px` for consistent grid alignment and optimal reading space.
- **Text Visibility**: Increased font size to `1.05rem` and line-height to `1.8` to fill 8-9 lines of space.
- **State Management**: `lastFetchedIds` Set to track unique article IDs.
- **Responsive Grid**: Adaptive layout using CSS Grid with `minmax(420px, 1fr)`.

---

## Current Plan: Full Article Content Extraction

### Step 1: content extraction utility (`main.js`)
- Create `fetchFullArticle` to retrieve and parse external HTML.
- Implement site-specific selectors (e.g., `section.article-body` for ETNews).

### Step 2: Update rendering logic (`main.js`)
- Modify `renderItem` to trigger full content fetch after initial RSS render.
- Ensure the card UI updates seamlessly via the `summary` attribute.

### Step 3: Verification
- Verify that cards now display significantly more content than the original RSS snippet.
- Confirm proxy reliability and error handling.
