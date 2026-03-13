/**
 * Daily Insight - Multi-Tab News Dashboard
 */

class AINewsItem extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['title', 'summary', 'link', 'date', 'is-new'];
    }

    attributeChangedCallback() {
        this.render();
    }

    connectedCallback() {
        this.render();
    }

    render() {
        const title = this.getAttribute('title') || 'No Title';
        const summary = this.getAttribute('summary') || 'No summary available.';
        const link = this.getAttribute('link') || '#';
        const date = this.getAttribute('date') || '';
        const isNew = this.hasAttribute('is-new');

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    height: 100%;
                }
                .card {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 1.5rem 1.5rem 0.75rem;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    text-decoration: none;
                    color: inherit;
                    cursor: pointer;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                    position: relative;
                }
                .card:hover {
                    transform: translateY(-8px);
                    background: rgba(255, 255, 255, 0.06);
                    border-color: oklch(65% 0.18 250 / 0.4);
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 
                                0 0 20px oklch(65% 0.18 250 / 0.1);
                }
                .card::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 4px;
                    background: linear-gradient(90deg, oklch(65% 0.18 250), oklch(85% 0.12 180));
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                .card:hover::after {
                    opacity: 1;
                }
                .badge-new {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: linear-gradient(135deg, #ff4d4d, #f9cb28);
                    color: white;
                    font-size: 0.6rem;
                    font-weight: 800;
                    padding: 2px 6px;
                    border-radius: 20px;
                    text-transform: uppercase;
                    box-shadow: 0 4px 10px rgba(255, 77, 77, 0.4);
                    z-index: 2;
                }
                .date {
                    font-size: 0.7rem;
                    color: oklch(75% 0.02 240);
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                h2 {
                    font-size: 1.25rem;
                    margin: 0 0 1rem;
                    font-weight: 700;
                    line-height: 1.4;
                    color: oklch(95% 0.01 240);
                }
                .summary-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                }
                .insight-label {
                    font-size: 0.65rem;
                    font-weight: 800;
                    color: var(--secondary-accent, oklch(85% 0.12 180));
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .insight-label::before {
                    content: '';
                    width: 5px;
                    height: 5px;
                    background: currentColor;
                    border-radius: 50%;
                    display: inline-block;
                    box-shadow: 0 0 8px currentColor;
                }
                p {
                    font-size: 0.95rem;
                    line-height: 1.7;
                    color: oklch(85% 0.01 240);
                    margin: 0;
                }
            </style>
            <a href="${link}" target="_blank" class="card">
                ${isNew ? '<div class="badge-new">NEW</div>' : ''}
                <div class="date">${date}</div>
                <h2>${title}</h2>
                <div class="summary-container">
                    <div class="insight-label">Core Insight</div>
                    <p>${summary}</p>
                </div>
            </a>
        `;
    }
}

customElements.define('ai-news-item', AINewsItem);

const FEEDS = {
    ai: 'https://rss.etnews.com/04046.xml',
    robot: 'https://www.irobotnews.com/rss/S1N1.xml'
};

let currentTab = 'ai';
const lastFetchedIds = {
    ai: new Set(),
    robot: new Set()
};

/**
 * Extracts the core insight (first 7-8 sentences) from a raw summary.
 */
function extractCoreInsight(text) {
    if (!text) return 'No summary available.';

    // 1. Initial Cleaning
    let cleanText = text
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 2. Remove common news agency prefixes/suffixes and reporter info
    cleanText = cleanText
        .replace(/^\[[^\]]+\]\s*/, '')      // [서울=뉴시스]
        .replace(/^\([^\)]+\)\s*/, '')      // (대전=연합뉴스)
        .replace(/^【[^】]+】\s*/, '')      // 【세종=뉴시스】
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '') // Email
        .replace(/[가-힣]{2,4}\s*(기자|특파원).*/, '') // Reporter name (at the end)
        .trim();

    // 3. Split by sentence enders (. ! ?)
    const sentences = cleanText.split(/(?<=[.!?])\s+/);

    // 4. Take first 7-8 sentences (Significantly increased for full visibility)
    let core = [];
    let currentLength = 0;
    
    for (const sentence of sentences) {
        // Stop if we have 8 sentences OR exceeds ~600 characters
        if (core.length >= 8 || currentLength > 600) break;
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && !trimmed.includes('제공=')) {
            core.push(trimmed);
            currentLength += trimmed.length;
        }
    }

    // 5. If we failed to get sentences, take a substring
    if (core.length === 0) {
        return cleanText.substring(0, 450) + '...';
    }

    let result = core.join(' ');
    
    if (!result.endsWith('.') && !result.endsWith('!') && !result.endsWith('?')) {
        result += '...';
    }

    return result;
}

async function fetchNews(tab, isSilent = false) {
    const grid = document.getElementById('news-grid');
    
    // Only show loader if it's not a silent background update
    if (!isSilent) {
        grid.innerHTML = `
            <div class="loader-container">
                <div class="loader"></div>
                <p>Fetching ${tab.toUpperCase()} insights...</p>
            </div>
        `;
    }

    const rssUrl = FEEDS[tab];
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        if (data.status !== 'ok') throw new Error(data.message);
        
        const items = data.items;
        if (!items || items.length === 0) {
            if (!isSilent) grid.innerHTML = '<p class="loader-container">No articles found in this category.</p>';
            return;
        }

        const newItems = [];
        const existingIds = lastFetchedIds[tab];

        items.forEach(item => {
            const id = item.guid || item.link;
            if (!existingIds.has(id)) {
                newItems.push(item);
                existingIds.add(id);
            }
        });

        if (!isSilent) {
            grid.innerHTML = '';
            // If not silent, we render all items from scratch but mark them as seen
            items.forEach((item, index) => renderItem(item, grid, index, false));
        } else if (newItems.length > 0) {
            // If silent and we have new items, prepend them
            console.log(`[Real-time] Found ${newItems.length} new items for ${tab}`);
            newItems.reverse().forEach((item) => renderItem(item, grid, 0, true));
        }

    } catch (error) {
        console.error('Error:', error);
        if (!isSilent) {
            grid.innerHTML = `
                <div class="loader-container">
                    <p>Failed to load ${tab.toUpperCase()} news.</p>
                    <small style="margin-top:1rem; color:var(--text-dim)">${error.message}</small>
                </div>
            `;
        }
    }
}

function renderItem(item, container, index, isNewBadge) {
    const title = item.title || '';
    const link = item.link || '';
    const description = item.description || '';
    const pubDate = item.pubDate || '';

    const dateObj = new Date(pubDate);
    const formattedDate = dateObj.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = description;
    const cleanDescription = tempDiv.textContent || tempDiv.innerText || '';
    
    // Extract core insight instead of showing everything
    const coreSummary = extractCoreInsight(cleanDescription);

    const newsItem = document.createElement('ai-news-item');
    newsItem.setAttribute('title', title);
    newsItem.setAttribute('summary', coreSummary);
    newsItem.setAttribute('link', link);
    newsItem.setAttribute('date', formattedDate);
    if (isNewBadge) {
        newsItem.setAttribute('is-new', '');
    }
    
    newsItem.style.opacity = '0';
    newsItem.style.transform = 'translateY(20px)';
    newsItem.style.transition = `all 0.5s ease ${index * 0.05}s`;

    if (isNewBadge) {
        container.insertBefore(newsItem, container.firstChild);
    } else {
        container.appendChild(newsItem);
    }

    requestAnimationFrame(() => {
        newsItem.style.opacity = '1';
        newsItem.style.transform = 'translateY(0)';
    });
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            if (tabId === currentTab) return;

            // Update UI
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update State
            currentTab = tabId;
            // When switching tabs, we do a full refresh (not silent)
            fetchNews(currentTab, false);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    fetchNews(currentTab, false);
});

// Real-time refresh every 1 minute
setInterval(() => fetchNews(currentTab, true), 60 * 1000);
