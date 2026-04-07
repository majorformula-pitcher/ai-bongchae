import React, { useState, useEffect } from 'react';
import './index.css';
import ai_robot_img from './assets/images/ai_robot.png';
import security_img from './assets/images/security.png';
import self_driving_img from './assets/images/self_driving.png';

const INITIAL_MOCK_DATA = [
  {
    id: 1,
    url: "https://n.news.naver.com/mnews/article/001/00000000",
    category: "AI & Robot",
    title: "LG전자, 자율주행 서비스 로봇 공개... AI 기반 최적 경로 탐색",
    image: ai_robot_img,
    summary: [
      "AI 기술을 활용한 자율주행 알고리즘 개발",
      "실내외 복합 환경에서도 빠른 속도로 이동 가능",
      "장애물 감지 및 회피 능력이 기존 대비 30% 향상",
      "다양한 배달 및 안내 서비스에 즉시 투입 예정"
    ],
    published_at: "2026-04-03",
    likes: 124
  },
  {
    id: 2,
    url: "https://n.news.naver.com/mnews/article/001/00000001",
    category: "보안",
    title: "해킹 위협 고도화... '제로 트러스트' 보안 체계 도입 확산",
    image: security_img,
    summary: [
      "최근 클라우드 환경을 노린 사이버 공격 급증",
      "모든 접속을 검증하는 제로 트러스트 보안이 핵심",
      "기업 내 중요 자산 보호를 위한 인프라 구축 필요",
      "정부 기관 중심으로 연내 가이드라인 발표 계획"
    ],
    published_at: "2026-04-02",
    likes: 89
  },
  {
    id: 3,
    url: "https://n.news.naver.com/mnews/article/001/00000002",
    category: "자율주행",
    title: "테슬라 FSD v12 배포... '자연스러운 운전' 수준 도달",
    image: self_driving_img,
    summary: [
      "엔드 투 엔드(End-to-End) 신경망 기술 전격 도입",
      "코드 기반이 아닌 영상 학습을 통한 판단력 확보",
      "복잡한 교차로에서도 사람과 유사한 판단 수행",
      "북미 지역 사용자 대상 대규모 업데이트 시작"
    ],
    published_at: "2026-04-01",
    likes: 215
  }
];

function App() {
  const [newsList, setNewsList] = useState(INITIAL_MOCK_DATA);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [likedNews, setLikedNews] = useState(new Set());
  const [showOnlyLiked, setShowOnlyLiked] = useState(false);
  
  // URL Input States
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const categories = ['All', 'AI & Robot', '보안', '자율주행'];

  const handleAddNews = () => {
    if (!urlInput.startsWith('http')) {
      alert('올바른 URL을 입력해주세요.');
      return;
    }

    setIsProcessing(true);
    setLoadingProgress(0);

    // Simulate AI Extraction & Summarization process
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setLoadingProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        
        // Mocking a newly added news item
        const newId = Date.now();
        const newNews = {
          id: newId,
          url: urlInput,
          category: "보안",
          title: "네이버 뉴스 - 사이버 보안 정책 강화 발표 (시뮬레이션 결과)",
          image: security_img,
          summary: [
            "URL 기반 자동 텍스트 추출 완료",
            "Gemini AI 모델을 통한 핵심 내용 분석",
            "사용자 맞춤형 4줄 요약 생성 성공",
            "시스템 보안 카테고리로 자동 분류됨"
          ],
          published_at: new Date().toISOString().split('T')[0],
          likes: 0
        };

        setNewsList([newNews, ...newsList]);
        setIsProcessing(false);
        setUrlInput('');
        setLoadingProgress(0);
      }
    }, 200);
  };

  const toggleLike = (id) => {
    const newLiked = new Set(likedNews);
    if (newLiked.has(id)) newLiked.delete(id);
    else newLiked.add(id);
    setLikedNews(newLiked);
  };

  const filteredNews = newsList.filter(news => {
    const matchesSearch = news.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || news.category === selectedCategory;
    const matchesLike = !showOnlyLiked || likedNews.has(news.id);
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

      {/* URL Input Section */}
      <div className="url-input-container">
        <div className="url-input-group">
          <input 
            type="text" 
            className="url-field" 
            placeholder="뉴스 URL을 입력하세요 (예: https://n.news.naver.com/...)"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={isProcessing}
          />
          <button 
            className="add-btn" 
            onClick={handleAddNews}
            disabled={isProcessing || !urlInput}
          >
            {isProcessing ? '⚡ 처리 중' : '뉴스 추가'}
          </button>
        </div>
        {isProcessing && (
          <>
            <div className="loading-bar-container" style={{background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden'}}>
              <div className="loading-bar" style={{width: `${loadingProgress}%`}}></div>
            </div>
            <div className="loading-text">AI가 뉴스를 분석하고 4줄 요약을 생성하고 있습니다...</div>
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
              <div className="news-image-container">
                <img src={news.image} alt={news.title} className="news-image" />
                <div className="news-category-badge">{news.category}</div>
              </div>
              <div className="news-content">
                <h2 className="news-title">{news.title}</h2>
                <ul className="news-summary">
                  {news.summary.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
                <div className="action-bar">
                  <div className="like-section" onClick={() => toggleLike(news.id)}>
                    <span className={`like-icon ${likedNews.has(news.id) ? 'active' : ''}`}>
                      {likedNews.has(news.id) ? '❤️' : '🤍'}
                    </span>
                    <span className="like-count">
                      {(likedNews.has(news.id) ? news.likes + 1 : news.likes)}
                    </span>
                  </div>
                  <div className="published-date">{news.published_at}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
            뉴스 결과가 없습니다.
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
