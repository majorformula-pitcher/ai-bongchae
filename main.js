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

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
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
                    border-radius: 20px;
                    padding: 2rem;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    color: inherit;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                    position: relative;
                    height: 520px;
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
                    font-size: 0.8rem;
                    color: oklch(75% 0.02 240);
                    margin-bottom: 0.75rem;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                h2 {
                    font-size: 1.4rem;
                    margin: 0 0 1rem;
                    font-weight: 700;
                    line-height: 1.3;
                    color: oklch(95% 0.01 240);
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .summary-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    flex-grow: 1;
                    margin-bottom: 1.5rem;
                    overflow: hidden;
                }
                .insight-label {
                    font-size: 0.75rem;
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
                    font-size: 1.05rem;
                    line-height: 1.8;
                    color: oklch(85% 0.01 240);
                    margin: 0;
                    display: -webkit-box;
                    -webkit-line-clamp: 8;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    animation: fadeIn 0.5s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0.5; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .cta-button {
                    margin-top: auto;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    padding: 1rem 1.5rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    color: var(--text-color, white);
                    text-decoration: none;
                    font-size: 0.95rem;
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

    let cleanText = text
        .replace(/<[^>]*>?/gm, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

    cleanText = cleanText
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/^\([^\)]+\)\s*/, '')
        .replace(/^【[^】]+】\s*/, '')
        .trim();

    if (cleanText.length > 1500) {
        return cleanText.substring(0, 1500) + '...';
    }

    return cleanText;
}

/**
 * Fetches the full content of an article via a CORS proxy and parses the HTML.
 */
async function fetchFullArticle(url) {
    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) return null;
        
        const data = await response.json();
        const html = data.contents;
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Remove common non-article elements
        const elementsToRemove = doc.querySelectorAll('script, style, nav, footer, header, .ads, .sidebar, .related, .comment, .footer-content');
        elementsToRemove.forEach(el => el.remove());

        // Target site-specific article bodies or common selectors
        const selectors = [
            'section.article-body', // ETNews
            '#article-view-content-div', // iRobotNews
            'article', 
            '.article-content', 
            '.post-content', 
            '.entry-content',
            'main p'
        ];

        let articleContent = '';
        for (const selector of selectors) {
            const container = doc.querySelector(selector);
            if (container) {
                // Get paragraphs from the container
                const paragraphs = container.querySelectorAll('p');
                if (paragraphs.length > 0) {
                    articleContent = Array.from(paragraphs)
                        .map(p => p.textContent.trim())
                        .filter(text => text.length > 40) // Filter out short fragments
                        .join(' ');
                    if (articleContent.length > 200) break;
                } else {
                    // Fallback to text content of the container
                    articleContent = container.textContent.trim();
                    if (articleContent.length > 200) break;
                }
            }
        }

        if (!articleContent || articleContent.length < 100) {
            // Last resort: extract all P tags from body
            const allPs = doc.querySelectorAll('p');
            articleContent = Array.from(allPs)
                .map(p => p.textContent.trim())
                .filter(text => text.length > 50)
                .slice(0, 5) // Take first 5 relevant paragraphs
                .join(' ');
        }

        return extractCoreInsight(articleContent);
    } catch (e) {
        console.error('Failed to fetch full article:', e);
        return null;
    }
}

async function fetchNews(tab, isSilent = false) {
    const grid = document.getElementById('news-grid');
    
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
            items.forEach((item, index) => renderItem(item, grid, index, false));
        } else if (newItems.length > 0) {
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
    const description = item.description || item.content || '';
    const pubDate = item.pubDate || '';

    const dateObj = new Date(pubDate);
    const formattedDate = dateObj.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = description;
    const initialSummary = extractCoreInsight(tempDiv.textContent || tempDiv.innerText || '');

    const newsItem = document.createElement('ai-news-item');
    newsItem.setAttribute('title', title);
    newsItem.setAttribute('summary', initialSummary);
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

    // Trigger full article content fetch asynchronously
    fetchFullArticle(link).then(fullContent => {
        if (fullContent && fullContent.length > initialSummary.length) {
            newsItem.setAttribute('summary', fullContent);
        }
    });

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

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            currentTab = tabId;
            fetchNews(currentTab, false);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    fetchNews(currentTab, false);
});

setInterval(() => fetchNews(currentTab, true), 60 * 1000);
