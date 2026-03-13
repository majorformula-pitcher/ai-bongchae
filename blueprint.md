# AI News Real-Time Dashboard - Blueprint

## Overview
The AI News Real-Time Dashboard is a modern, high-performance web application designed to fetch and display the latest AI-related news from the ETNews RSS feed (`http://rss.etnews.com/04046.xml`). This project focuses on a "Cyber/AI" aesthetic, utilizing modern web standards such as Web Components, OKLCH color spaces, and container queries to provide a seamless and visually stunning experience across all devices.

## Project Vision
To provide users with a clean, focused, and real-time news experience that feels futuristic and intuitive. The design is inspired by modern tech interfaces with a focus on typography, depth, and interactivity.

## Style, Design, and Features

### 1. Visual Design (Aesthetics)
- **Aesthetic**: Modern Tech/AI theme with dark mode by default.
- **Typography**: "Inter" (sans-serif) for body text and bold headlines.
- **Color Palette (OKLCH)**:
  - Background: `oklch(15% 0.02 240)` (Deep Space Blue)
  - Primary Accent: `oklch(60% 0.15 250)` (Deep AI Blue)
  - Secondary Accent: `oklch(80% 0.1 180)` (Cyber Cyan)
  - Text: `oklch(95% 0.01 240)` (Off-white)
- **Effects**:
  - **Glassmorphism**: Translucent card backgrounds with backdrop blur.
  - **Glows**: Subtle blue and cyan glows on interactive elements.
  - **Texture**: A subtle noise texture applied to the main background for a premium feel.
  - **Depth**: Multi-layered drop shadows (`box-shadow`) to create a sense of elevation.

### 2. Functional Features
- **RSS Integration**: Fetches real-time data from ETNews AI RSS feed.
- **Web Components**:
  - `<ai-news-item>`: Encapsulated news cards with title, summary, and link.
- **Responsive Layout**: Adapts from mobile to ultra-wide screens using CSS Grid.
- **Accessibility**: ARIA-compliant semantic HTML and high-contrast color choices.

### 3. Implementation Details (Current Version)
- **V1 - Initial Setup (Current)**:
  - Framework-less approach (Vanilla JS, CSS, HTML).
  - RSS parsing using native `DOMParser`.
  - Responsive Grid layout for news cards.

---

## Current Plan: AI News Implementation

### Step 1: Base Structure (`index.html`)
- Setup semantic HTML5 boilerplate.
- Add containers for the header and the news grid.
- Link `style.css` and `main.js` (as module).

### Step 2: Global Styles (`style.css`)
- Define CSS Variables for the OKLCH color palette.
- Apply global resets and background textures.
- Create a responsive grid for the news feed.
- Implement glassmorphism styles.

### Step 3: Core Logic & Web Components (`main.js`)
- Define the `AINewsItem` custom element.
- Implement the `fetchNews` function to retrieve and parse RSS.
- Dynamically render `<ai-news-item>` elements for each news story.

### Step 4: Refinement & Verification
- Test feed loading and parsing.
- Refine card layout and typography.
- Ensure smooth transitions and hover effects.
