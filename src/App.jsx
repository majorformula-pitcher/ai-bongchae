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
  
  // 전체 뉴스 데이터에서 유니크한 카테고리 목록 추출 및 커스텀 정렬
  const categories = ['All', ...new Set(newsList.map(news => news.category).filter(Boolean))].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    
    const aIsEng = /^[a-zA-Z]/.test(a);
    const bIsEng = /^[a-zA-Z]/.test(b);
    
    if (aIsEng && !bIsEng) return -1; // 영어가 앞으로
    if (!aIsEng && bIsEng) return 1;  // 한글이 뒤로
    
    return a.localeCompare(b, 'ko'); // 같은 언어끼리는 가나다/ABC 순
  });

  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCategory, setManualCategory] = useState('기타');

  const handleAddNews = async () => {
    if (!urlInput.startsWith('http')) {
      alert('올바른 URL을 입력해주세요.');
      return;
    }

    setIsProcessing(true);
    setLoadingProgress(10);
    setManualMode(false); // 초기화

    try {
      // 0. 중복 체크 (URL 기준)
      const { data: existingNews, error: checkError } = await supabase
        .from('ai-bongchae')
        .select('id')
        .eq('url', urlInput)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingNews) {
        alert('이미 등록된 뉴스입니다!');
        setIsProcessing(false);
        setLoadingProgress(0);
        return;
      }

      // 1. 백엔드 AI 추출 요청
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput })
      });
      const result = await response.json();

      // 추출 실패 시 (403 차단 등) 수동 입력 모드로 전환
      if (!result.success) {
        setManualMode(true);
        setIsProcessing(false);
        setLoadingProgress(0);
        return;
      }

      setLoadingProgress(80);

      // 2. Supabase DB 저장
      const { data, error } = await supabase
        .from('ai-bongchae')
        .insert([
          {
            title: result.title,
            summary: result.summary,
            url: result.url,
            category: result.category,
            published_at: result.published_at,
            image: result.image,
            likes: false
          }
        ])
        .select();

      if (error) throw error;

      // 3. 상태 업데이트
      setNewsList([data[0], ...newsList]);
      setUrlInput('');
      alert('뉴스가 자동으로 등록되었습니다! ✨');
    } catch (error) {
      console.error('Add news error:', error);
      setManualMode(true); // 에러 발생 시 수동 모드 권장
    } finally {
      setIsProcessing(false);
      setLoadingProgress(0);
    }
  };

  const handleManualAdd = async () => {
    if (!manualTitle) {
      alert('제목을 입력해주세요.');
      return;
    }
    
    setIsProcessing(true);
    try {
      const { data, error } = await supabase
        .from('ai-bongchae')
        .insert([
          {
            title: manualTitle,
            summary: '사용자가 직접 등록한 뉴스입니다.',
            url: urlInput,
            category: manualCategory,
            published_at: new Date().toISOString(),
            image: null, // 플레이스홀더 생성됨
            likes: false
          }
        ])
        .select();

      if (error) throw error;

      setNewsList([data[0], ...newsList]);
      setUrlInput('');
      setManualMode(false);
      setManualTitle('');
      alert('뉴스가 수동으로 등록되었습니다! ✅');
    } catch (error) {
      alert('수동 등록 중 오류 발생: ' + error.message);
    } finally {
      setIsProcessing(false);
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
          <div className="logo">AI Bongchae</div>
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
            {isProcessing ? '⚡ 분석 중' : '뉴스 추가'}
          </button>
        </div>
        {isProcessing && (
          <>
            <div className="loading-bar-container">
              <div className="loading-bar" style={{width: `${loadingProgress}%`}}></div>
            </div>
            <div className="loading-text">보안 사이트 여부를 확인하며 분석 중입니다...</div>
          </>
        )}

        {manualMode && (
          <div className="manual-input-area">
            <p className="manual-desc">⚠️ 보안상 자동 추출이 차단된 사이트입니다. 제목을 직접 입력해 주세요.</p>
            <input 
              type="text" 
              className="manual-field" 
              placeholder="뉴스 제목을 입력하세요..." 
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
            />
            <div className="manual-row">
              <select 
                className="manual-field manual-select"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
              >
                <option value="IT">IT</option>
                <option value="AI">AI</option>
                <option value="보안">보안</option>
                <option value="기타">기타</option>
              </select>
              <button 
                className="add-btn manual-btn" 
                onClick={handleManualAdd}
                disabled={isProcessing}
              >
                수동 등록 완료
              </button>
            </div>
          </div>
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
              <div className="news-category-badge">{news.category}</div>
              <a href={news.url} target="_blank" rel="noopener noreferrer" className="news-image-container">
                {news.image ? (
                  <img src={news.image} alt={news.title} className="news-image" />
                ) : (
                  <div className="news-image-placeholder">
                    <span>이미지가 없는 뉴스입니다</span>
                  </div>
                )}
              </a>
              <div className="news-content">
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
                  <div className="published-date">
                    {news.published_at ? new Date(news.published_at).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }).replace(/(\d{4}). (\d{2}). (\d{2})./, '$1.$2.$3.') : ''}
                  </div>
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
