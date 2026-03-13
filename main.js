/**
 * AI News Real-Time Dashboard
 * Powered by ETNews RSS
 */

class AINewsItem extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['title', 'summary', 'link', 'date'];
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

const RSS_URL = 'https://rss.etnews.com/04046.xml';
// Using rss2json service which is more specialized for RSS feeds and often more stable
const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;

async function fetchNews() {
    const grid = document.getElementById('news-grid');
    
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch news from RSS API');
        
        const data = await response.json();
        
        if (data.status !== 'ok') {
            throw new Error(data.message || 'Error parsing RSS feed');
        }
        
        const items = data.items;
        
        if (!items || items.length === 0) {
            grid.innerHTML = '<p class="loader-container">No news found at the moment.</p>';
            return;
        }

        // Clear loader and previous items
        grid.innerHTML = '';

        items.forEach((item, index) => {
            const title = item.title || '';
            const link = item.link || '';
            const description = item.description || '';
            const pubDate = item.pubDate || '';

            // Format date
            const dateObj = new Date(pubDate);
            const formattedDate = dateObj.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            // Strip HTML from description
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = description;
            const cleanDescription = tempDiv.textContent || tempDiv.innerText || '';

            const newsItem = document.createElement('ai-news-item');
            newsItem.setAttribute('title', title);
            newsItem.setAttribute('summary', cleanDescription);
            newsItem.setAttribute('link', link);
            newsItem.setAttribute('date', formattedDate);
            
            // Add staggered animation delay
            newsItem.style.opacity = '0';
            newsItem.style.transform = 'translateY(20px)';
            newsItem.style.transition = `all 0.5s ease ${index * 0.05}s`;

            grid.appendChild(newsItem);

            // Trigger animation
            requestAnimationFrame(() => {
                newsItem.style.opacity = '1';
                newsItem.style.transform = 'translateY(0)';
            });
        });

    } catch (error) {
        console.error('Error fetching news:', error);
        grid.innerHTML = `
            <div class="loader-container">
                <p>Unable to load news. Please try again later.</p>
                <small style="margin-top: 1rem; color: var(--text-dim);">${error.message}</small>
            </div>
        `;
    }
}

// Initial fetch
document.addEventListener('DOMContentLoaded', fetchNews);

// Refresh every 10 minutes
setInterval(fetchNews, 10 * 60 * 1000);
