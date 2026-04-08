import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import './index.css';

function App() {
  const [newsList, setNewsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showOnlyLiked, setShowOnlyLiked] = useState(false);
  
  // DB에서 뉴스 읽어오기
  const fetchNews = async () => {
    const { data, error } = await supabase
      .from('ai-bongchae')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) console.error('Error fetching news:', error);
    else setNewsList(data || []);
  };

  useEffect(() => {
    fetchNews();
  }, []);
  
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const categories = ['All', 'AI & Robot', '보안', '자율주행'];

  const handleAddNews = async () => {
    if (!urlInput.startsWith('http')) {
      alert('올바른 URL을 입력해주세요.');
      return;
    }

    setIsProcessing(true);
    setLoadingProgress(10);

    try {
      // 1. 백엔드 AI 추출 요청 (강화된 로직 적용)
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput })
      });
      const result = await response.json();

      if (!result.success) throw new Error(result.error);
      setLoadingProgress(80);

      // 2. Supabase DB 저장 (이미지 필드 포함)
      const { data, error } = await supabase
        .from('ai-bongchae')
        .insert([
          {
            title: result.title,
            summary: result.summary,
            url: result.url,
            category: result.category,
            published_at: result.published_at,
            image: result.image, // 추출된 이미지 URL 저장
            likes: false
          }
        ])
        .select();

      if (error) throw error;

      // 3. 상태 업데이트
      setNewsList([data[0], ...newsList]);
      setUrlInput('');
    } catch (error) {
      console.error('Add news error:', error);
      alert('뉴스를 추가하는 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsProcessing(false);
      setLoadingProgress(0);
    }
  };

  const toggleLike = async (id, currentStatus) => {
    const { error } = await supabase
      .from('ai-bongchae')
      .update({ likes: !currentStatus })
      .eq('id', id);

    if (error) {
      console.error('Like error:', error);
    } else {
      setNewsList(newsList.map(news => 
        news.id === id ? { ...news, likes: !currentStatus } : news
      ));
    }
  };

  const filteredNews = newsList.filter(news => {
    const matchesSearch = news.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || news.category === selectedCategory;
    const matchesLike = !showOnlyLiked || news.likes;
    return matchesSearch && matchesCategory && matchesLike;
  });

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <div className="logo">News Curator</div>
          <button 
            className={`filter-btn ${showOnlyLiked ? 'active' : ''}`}
            onClick={() => setShowOnlyLiked(!showOnlyLiked)}
          >
            {showOnlyLiked ? '전체 보기' : '좋아요 목록'}
          </button>
        </div>
      </header>

      <div className="url-input-container">
        <div className="url-input-group">
          <input 
            type="text" 
            className="url-field" 
            placeholder="뉴스 URL을 입력하세요..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={isProcessing}
          />
          <button 
            className="add-btn" 
            onClick={handleAddNews}
            disabled={isProcessing || !urlInput}
          >
            {isProcessing ? '⚡ 요약 중' : '뉴스 추가'}
          </button>
        </div>
        {isProcessing && (
          <>
            <div className="loading-bar-container">
              <div className="loading-bar" style={{width: `${loadingProgress}%`}}></div>
            </div>
            <div className="loading-text">전문가급 AI 크롤러가 뉴스를 정밀 분석 중입니다...</div>
          </>
        )}
      </div>

      <div className="search-container">
        <input 
          type="text" 
          placeholder="제목으로 검색..." 
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filter-bar">
        {categories.map(cat => (
          <button 
            key={cat} 
            className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <main className="news-feed">
        {filteredNews.length > 0 ? (
          filteredNews.map(news => (
            <div key={news.id} className="news-card">
              {/* 이미지가 있을 경우에만 렌더링 */}
              {news.image && (
                <div className="news-image-container">
                  <img src={news.image} alt={news.title} className="news-image" />
                </div>
              )}
              <div className="news-content">
                <div className="news-category-badge">{news.category}</div>
                <h2 className="news-title">
                  <a href={news.url} target="_blank" rel="noopener noreferrer" style={{color: 'inherit', textDecoration: 'none'}}>
                    {news.title}
                  </a>
                </h2>
                <ul className="news-summary">
                  {(news.summary || '').split('\n').filter(line => line.trim()).map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
                <div className="action-bar">
                  <div className="action-left">
                    <div className="like-section" onClick={() => toggleLike(news.id, news.likes)}>
                      <span className={`like-icon ${news.likes ? 'active' : ''}`}>
                        {news.likes ? '❤️' : '🤍'}
                      </span>
                      <span className="like-count">
                        {news.likes ? 1 : 0}
                      </span>
                    </div>
                    <a href={news.url} target="_blank" rel="noopener noreferrer" className="source-link">
                      원문 보기
                    </a>
                  </div>
                  <div className="published-date">{news.published_at}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-result">결과가 없습니다.</div>
        )}
      </main>
    </div>
  );
}

export default App;
