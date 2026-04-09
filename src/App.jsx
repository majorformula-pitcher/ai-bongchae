import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import './index.css';

const API_URL = ''; // 백엔드 통신 주소 복구

function App() {
  const [newsList, setNewsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showOnlyLiked, setShowOnlyLiked] = useState(false);
  const [selectedDate, setSelectedDate] = useState(''); // 날짜 필터 추가 (YYYY-MM-DD 형식)
  
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
  const [manualErrorMessage, setManualErrorMessage] = useState(''); // 에러 메시지 상태 추가
  const [manualTitle, setManualTitle] = useState('');
  const [manualSummary, setManualSummary] = useState(''); // 수동 요약문 상태 추가
  const [manualCategory, setManualCategory] = useState(''); // 초기값 비움

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

      // 추출 실패 시 (실제 추출 불가 상황) 수동 입력 모드로 전환
      if (!result.success) {
        setManualErrorMessage(result.error || '자동 추출에 실패했습니다.');
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
            engine: result.engine, // AI 엔진 정보 추가
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
      setManualErrorMessage('네트워크 오류가 발생했습니다: ' + error.message);
      setManualMode(true); // 에러 발생 시 수동 모드 권장
    } finally {
      setIsProcessing(false);
      setLoadingProgress(0);
    }
  };

  const handleManualAdd = async () => {
    if (!manualTitle) return;
    
    setIsProcessing(true);
    let finalTitle = manualTitle;
    let finalSummary = manualSummary || '사용자가 직접 등록한 뉴스입니다.';
    let finalCategory = manualCategory;
    let finalEngine = 'User'; // 기본 출처는 사용자

    try {
      // 본문이 20자 이상이면 자동으로 AI 요약 수행
      if (manualSummary && manualSummary.length >= 20) {
        try {
          const aiResponse = await fetch(`${API_URL}/api/summarize-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              text: manualSummary,
              title: manualTitle 
            })
          });
          const aiData = await aiResponse.json();
          if (aiData.success) {
            finalTitle = aiData.title || finalTitle;
            finalSummary = aiData.summary || finalSummary;
            finalCategory = aiData.category || (finalCategory === '' ? '기타' : finalCategory);
            finalEngine = (aiData.engine || 'Gemini') + ' (수동)'; // 엔진명에 수동 마커 추가
            console.log(`[ManualAdd] AI Summarization success: ${finalEngine}`);
          } else {
            alert(`AI 요약 서비스 응답 오류: ${aiData.error || '알 수 없는 에러'}`);
          }
        } catch (aiErr) {
          console.error('[ManualAdd] Auto AI summarization error:', aiErr);
          alert(`AI 연결 오류 상세: ${aiErr.message}\n(서버 응답이 JSON이 아니거나 네트워크 문제일 수 있습니다.)`);
        }
      }

      const { data, error } = await supabase
        .from('ai-bongchae')
        .insert([
          {
            title: finalTitle,
            summary: finalSummary,
            url: urlInput,
            category: finalCategory || '기타',
            engine: finalEngine, // 동적으로 결정된 엔진 정보 저장
            published_at: new Date().toISOString(),
            image: null, 
            likes: false
          }
        ])
        .select();

      if (error) throw error;

      setNewsList([data[0], ...newsList]);
      setUrlInput('');
      setManualMode(false);
      setManualTitle('');
      setManualSummary('');
      setManualCategory('');
      alert('뉴스가 성공적으로 등록되었습니다! ✅');
    } catch (error) {
      alert('등록 중 오류 발생: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm('정말 삭제하시겠습니까?')) {
      try {
        const { error } = await supabase
          .from('ai-bongchae')
          .delete()
          .eq('id', id);

        if (error) throw error;

        setNewsList(newsList.filter(news => news.id !== id));
        alert('삭제되었습니다.');
      } catch (error) {
        alert('삭제 중 오류 발생: ' + error.message);
      }
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
    const matchesDate = !selectedDate || (news.created_at && new Date(news.created_at).toISOString().split('T')[0] === selectedDate);
    return matchesSearch && matchesCategory && matchesLike && matchesDate;
  });

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <a href="/" className="logo-link">
            <div className="logo">AI Bongchae</div>
          </a>
          <div className="header-actions">
            <div className="date-filter-group">
              <input 
                type="date" 
                className="date-input" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              {selectedDate && (
                <button className="date-clear-btn" onClick={() => setSelectedDate('')} title="날짜 초기화">
                  ×
                </button>
              )}
            </div>
            <button 
              className={`filter-btn ${showOnlyLiked ? 'active' : ''}`}
              onClick={() => setShowOnlyLiked(!showOnlyLiked)}
            >
              {showOnlyLiked ? '전체 보기' : '좋아요 목록'}
            </button>
          </div>
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
            <div className="manual-header">
              <p className="manual-desc">⚠️ {manualErrorMessage}</p>
              <button 
                className="manual-cancel-btn"
                onClick={() => setManualMode(false)}
              >
                입력 취소
              </button>
            </div>
            <input 
              type="text" 
              className="manual-field" 
              placeholder="뉴스 제목을 입력하세요 (필수)" 
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
            />
            <textarea 
              className="manual-field manual-textarea" 
              placeholder="뉴스 요약 또는 본문을 입력하세요 (선택)" 
              value={manualSummary}
              onChange={(e) => setManualSummary(e.target.value)}
            />
            <div className="manual-row">
              <input 
                type="text"
                className="manual-field manual-category-input"
                placeholder="Category 입력하세요 (AI, Robot 등)"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
              />
              <button 
                className="add-btn manual-btn" 
                onClick={handleManualAdd}
                disabled={isProcessing || !manualTitle}
              >
                {isProcessing ? 'AI 요약 및 등록 중...' : '수동 등록 완료'}
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
              <button className="delete-btn" title="뉴스 삭제" onClick={(e) => handleDelete(e, news.id)}>×</button>
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
                    <span className="ai-source-info">
                      {news.engine && news.engine.includes('(수동)') ? 
                        `${news.engine.replace('(수동)', '').trim()}가 요약했습니다. (사용자가 뉴스 직접 등록)` : 
                        news.engine && news.engine !== 'User' ? `${news.engine}가 요약했습니다.` : 
                        news.engine === 'User' ? '사용자가 직접 등록했습니다.' : ''}
                    </span>
                  </div>
                  <div className="published-date">
                    {news.created_at ? new Date(news.created_at).toLocaleString('ko-KR', {
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
