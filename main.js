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
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    color: inherit;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                    position: relative;
                    height: 500px;
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
                    top: 1.25rem;
                    right: 1.25rem;
                    background: linear-gradient(135deg, #ff4d4d, #f9cb28);
                    color: white;
                    font-size: 0.65rem;
                    font-weight: 800;
                    padding: 2px 8px;
                    border-radius: 20px;
                    text-transform: uppercase;
                    box-shadow: 0 4px 10px rgba(255, 77, 77, 0.4);
                    z-index: 2;
                }
                .date {
                    font-size: 0.75rem;
                    color: oklch(75% 0.02 240);
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                h2 {
                    font-size: 1.25rem;
                    margin: 0 0 0.75rem;
                    font-weight: 700;
                    line-height: 1.3;
                    color: oklch(95% 0.01 240);
                }
                .summary-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    flex-grow: 1;
                    margin-bottom: 1rem;
                    overflow: hidden;
                }
                .insight-label {
                    font-size: 0.7rem;
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
                    width: 6px;
                    height: 6px;
                    background: currentColor;
                    border-radius: 50%;
                    display: inline-block;
                    box-shadow: 0 0 8px currentColor;
                }
                p {
                    font-size: 0.95rem;
                    line-height: 1.6;
                    color: oklch(85% 0.01 240);
                    margin: 0;
                    display: -webkit-box;
                    -webkit-line-clamp: 9;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .cta-button {
                    margin-top: auto;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    padding: 0.9rem 1.5rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    color: var(--text-color, white);
                    text-decoration: none;
                    font-size: 0.9rem;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                }
                .cta-button:hover {
                    background: var(--primary-accent, oklch(65% 0.18 250));
                    border-color: transparent;
                    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3), 0 0 15px var(--glow-color);
                    transform: translateY(-2px);
                }
                .cta-button svg {
                    width: 18px;
                    height: 18px;
                    transition: transform 0.3s ease;
                }
                .cta-button:hover svg {
                    transform: translateX(3px);
                }
            </style>
            <div class="card">
                ${isNew ? '<div class="badge-new">NEW</div>' : ''}
                <div class="date">${date}</div>
                <h2>${title}</h2>
                <div class="summary-container">
                    <div class="insight-label">Core Insight</div>
                    <p>${summary}</p>
                </div>
                <a href="${link}" target="_blank" class="cta-button">
                    View Full Article
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </a>
            </div>
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
 * Extracts the core insight from a raw summary.
 */
function extractCoreInsight(text) {
    if (!text) return 'No summary available.';

    // 1. Initial Cleaning (Remove basic HTML and normalize whitespace)
    let cleanText = text
        .replace(/<[^>]*>?/gm, '') // Remove HTML tags just in case
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 2. Remove only common news agency prefixes at the very start
    cleanText = cleanText
        .replace(/^\[[^\]]+\]\s*/, '')      // [서울=뉴시스]
        .replace(/^\([^\)]+\)\s*/, '')      // (대전=연합뉴스)
        .replace(/^【[^】]+】\s*/, '')      // 【세종=뉴시스】
        .trim();

    // 3. Instead of aggressive sentence splitting, we just take a generous chunk
    // This ensures we definitely fill the 9 lines if the content exists.
    if (cleanText.length > 1200) {
        return cleanText.substring(0, 1200) + '...';
    }

    return cleanText;
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
