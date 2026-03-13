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
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    text-decoration: none;
                    color: inherit;
                    cursor: pointer;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                    position: relative;
                    overflow: hidden;
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
                    margin-bottom: 0.75rem;
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
                p {
                    font-size: 0.95rem;
                    color: oklch(75% 0.02 240);
                    margin: 0;
                    display: -webkit-box;
                    -webkit-line-clamp: 4;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    flex-grow: 1;
                }
                .read-more {
                    margin-top: 1.5rem;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: oklch(65% 0.18 250);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .read-more svg {
                    width: 16px;
                    height: 16px;
                    transition: transform 0.3s ease;
                }
                .card:hover .read-more svg {
                    transform: translateX(4px);
                }
            </style>
            <a href="${link}" target="_blank" class="card">
                ${isNew ? '<div class="badge-new">NEW</div>' : ''}
                <div class="date">${date}</div>
                <h2>${title}</h2>
                <p>${summary}</p>
                <div class="read-more">
                    Read Full Article
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
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

    const newsItem = document.createElement('ai-news-item');
    newsItem.setAttribute('title', title);
    newsItem.setAttribute('summary', cleanDescription);
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
