import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabaseClient';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Compass, List, Plus, X, ChevronUp, 
  RefreshCw, Zap, ExternalLink, CheckCircle2 
} from 'lucide-react';
import './index.css';

const API_URL = ''; // 백엔드 통신 주소 복구

function App() {
  const [newsList, setNewsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showOnlyLiked, setShowOnlyLiked] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [manualMode, setManualMode] = useState(false);
  const [manualErrorMessage, setManualErrorMessage] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualCategory, setManualCategory] = useState('');

  // RSS Discovery 관련 상태
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [rssFeeds, setRssFeeds] = useState([]);
  const [selectedFeedId, setSelectedFeedId] = useState(null);
  const [rssItems, setRssItems] = useState([]);
  const [isRssLoading, setIsRssLoading] = useState(false);
  const [navTab, setNavTab] = useState('home');
  const [processingUrls, setProcessingUrls] = useState(new Set()); // 개별 뉴스 처리 상태 추적

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
    
    // 초기 피드 목록 로드
    const fetchFeeds = async () => {
      try {
        const res = await fetch('/api/rss-feeds');
        const data = await res.json();
        if (data.success) {
          setRssFeeds(data.feeds);
          // 초기 선택 삭제 (사용자 의도에 따라 수동 로딩으로 변경)
        }
      } catch (err) {
        console.error('Failed to fetch RSS feeds:', err);
      }
    };
    fetchFeeds();
  }, []);

  // 선택된 피드가 변경될 때 기사 로드
  useEffect(() => {
    if (selectedFeedId !== null) {
      loadRssItems(selectedFeedId);
    }
  }, [selectedFeedId]);

  const loadRssItems = async (id) => {
    setIsRssLoading(true);
    setRssItems([]); // 채널 변경 시 즉시 이전 목록 초기화
    try {
      const res = await fetch(`/api/rss/${id}`);
      const data = await res.json();
      if (data.success) setRssItems(data.items);
    } catch (err) {
      console.error('Failed to load RSS items:', err);
    } finally {
      setIsRssLoading(false);
    }
  };

  const handleAddNews = async (targetUrl = null) => {
    const finalUrl = targetUrl || urlInput;
    if (!finalUrl || !finalUrl.startsWith('http')) {
      alert('올바른 URL을 입력해주세요.');
      return;
    }

    if (processingUrls.has(finalUrl)) return; // 이미 처리 중이면 중단

    setIsProcessing(true);
    setProcessingUrls(prev => new Set(prev).add(finalUrl)); // 해당 URL 락(Lock)
    setLoadingProgress(10);
    setManualMode(false); // 초기화

    try {
      // 1. 서버 측 추출 및 분석 요청 (중복 체크도 서버에서 수행)
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl })
      });
      const result = await response.json();

      // 추출 실패 시 수동 입력 모드로 전환
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
            engine: result.engine,
            likes: false
          }
        ])
        .select();

      if (error) throw error;

      // 3. 상태 업데이트 및 알림
      setNewsList([data[0], ...newsList]);
      if (!targetUrl) setUrlInput('');
      
      // RSS 리스트 상태 업데이트 (목록에서 '추가됨' 표시를 위해)
      if (targetUrl) {
          setRssItems(prev => prev.map(item => 
              item.link === targetUrl ? { ...item, isAdded: true } : item
          ));
      }

      setLoadingProgress(100);
      setTimeout(() => setLoadingProgress(0), 1000);
    } catch (error) {
      console.error('Add news error:', error);
      alert('뉴스 추가 중 오류 발생: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProcessingUrls(prev => {
        const next = new Set(prev);
        next.delete(finalUrl);
        return next;
      }); // 패치 완료 후 락 해제
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
      } catch (error) {
        alert('삭제 중 오류 발생: ' + error.message);
      }
    }
  };

  const toggleLike = async (e, id, currentStatus) => {
    e.preventDefault();
    e.stopPropagation(); // Stop event from bubbling up to parents
    
    try {
      const response = await fetch('/api/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, currentStatus })
      });
      
      const result = await response.json();

      if (!result.success) {
        console.error('Like error:', result.error);
        alert(`좋아요 처리 중 오류가 발생했습니다.\n\n[상세 사유]: ${result.error}\n\n※ 사내 보안망이나 광고 차단 프로그램 또는 서버 설정 문제일 수 있습니다.`);
      } else {
        setNewsList(prevList => prevList.map(news => 
          news.id === id ? { ...news, likes: !currentStatus } : news
        ));
      }
    } catch (err) {
      console.error('Like exception:', err);
      alert(`시스템 예외가 발생했습니다.\n\n[상세]: ${err.message}\n\n※ 서버 연결이 원활하지 않거나 보안망에 의해 통신이 차단되었을 가능성이 큽니다.`);
    }
  };
  
  const handleExportExcel = async () => {
    try {
      const { data, error } = await supabase
        .from('ai-bongchae')
        .select('title, summary, category, url, created_at, engine')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const excelData = data.map(item => ({
        '제목': item.title,
        '카테고리': item.category || '기타',
        '핵심 요약': item.summary,
        '출처 URL': item.url,
        '작성 엔진': item.engine || 'Unknown',
        '등록 시간': new Date(item.created_at).toLocaleString('ko-KR')
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'News_List');

      const wscols = [
        { wch: 45 }, { wch: 15 }, { wch: 75 }, { wch: 35 }, { wch: 15 }, { wch: 25 }
      ];
      worksheet['!cols'] = wscols;

      const fileName = `AI_Bongchae_News_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      alert('엑셀 내보내기 오류: ' + error.message);
    }
  };

  const handleExportPPT = () => {
    try {
      if (filteredNews.length === 0) {
        alert('추출할 뉴스가 없습니다.');
        return;
      }

      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';

      const totalNews = filteredNews.length;
      let processedCount = 0;

      // 이미지를 안전하게 가져오기 위한 헬퍼 함수
      const getSafeImage = async (url) => {
        try {
          const resp = await fetch(url, { mode: 'no-cors' }); 
          // 'no-cors'는 이미지를 직접 읽을 순 없지만 브라우저 캐시에는 넣을 수 있음. 
          // 하지만 pptxgenjs는 내부적으로 fetch(url)을 다시 할 것이므로 큰 의미는 없음.
          // 대신, 특정 이미지 서버가 CORS를 허용하는지 미리 체크하거나, 실패 시 null 반환
          const checkResp = await fetch(url, { method: 'HEAD' }).catch(() => ({ ok: false }));
          return checkResp.ok ? url : null;
        } catch {
          return null;
        }
      };

      // 순차적으로 슬라이드 생성 (이미지 체크 대기)
      const generateSlides = async () => {
        for (const news of filteredNews) {
          const slide = pres.addSlide();
          
          // 제목 배치 (상단)
          slide.addText(news.title, { 
            x: 0.5, y: 0.3, w: '90%', 
            fontSize: 16, bold: true, color: '0066CC',
            underline: { style: 'sng' }
          });

          // 요약 내용 (좌측)
          const summaryLines = (news.summary || '')
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => ({ 
              text: line.replace(/^[•\-\*]\s*/, ''), 
              options: { bullet: true, fontSize: 12, color: '333333', lineSpacing: 28 } 
            }));

          slide.addText(summaryLines, { 
            x: 0.5, y: 1.2, w: '55%', h: '70%', 
            valign: 'top' 
          });

          // 이미지 (우측) - 에러 발생 시 건너뜀
          if (news.image) {
            try {
              // CORS 문제를 해결하기 위해 백엔드 프록시 주소 사용
              const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(news.image)}`;
              slide.addImage({ 
                path: proxyUrl, 
                x: 6.2, y: 1.2, w: 3.5, h: 2.6,
                sizing: { type: 'contain', w: 3.5, h: 2.6 }
              });
            } catch (imgErr) {
              console.warn('Image skip due to error:', imgErr);
            }
          }
        }
        
        await pres.writeFile({ fileName: `AI_Bongchae_PPT_${new Date().toLocaleDateString()}.pptx` });
      };

      generateSlides();
    } catch (err) {
      console.error('PPT Export Error:', err);
      alert('PPT 생성 중 오류가 발생했습니다.');
    }
  };

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

  const filteredNews = newsList.filter(news => {
    const matchesSearch = news.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || news.category === selectedCategory;
    const matchesLike = !showOnlyLiked || news.likes;
    const matchesDate = !selectedDate || (news.created_at && (() => {
      const d = new Date(news.created_at);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}` === selectedDate;
    })());
    return matchesSearch && matchesCategory && matchesLike && matchesDate;
  });

  const DiscoveryContent = () => (
    <>
      <div className="discovery-header">
        <Compass size={20} className="text-primary" />
        <span>뉴스 발견 (Discovery)</span>
        {isRssLoading && <RefreshCw size={14} className="animate-spin ml-auto text-primary" />}
      </div>
      
      <div className="channel-list">
        {rssFeeds.map(feed => (
          <button 
            key={feed.id} 
            className={`channel-btn ${selectedFeedId === feed.id ? 'active' : ''}`}
            onClick={() => setSelectedFeedId(feed.id)}
          >
            {feed.name}
          </button>
        ))}
      </div>

      <div className="rss-feed-list">
        {rssItems.map((item, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rss-card ${item.isAdded ? 'added' : ''} ${processingUrls.has(item.link) ? 'processing' : ''}`}
            onClick={() => window.open(item.link, '_blank')}
          >
            <div className="rss-card-main">
              <div className="rss-title">{item.title}</div>
              <div className="rss-meta">
                <span>{new Date(item.pubDate).toLocaleDateString()}</span>
              </div>
            </div>
            
            <div className="rss-action-area">
              {processingUrls.has(item.link) ? (
                <div className="rss-status-icon processing">
                  <RefreshCw size={18} className="animate-spin text-primary" />
                </div>
              ) : item.isAdded ? (
                <div className="rss-status-icon added" title="이미 추가됨">
                  <CheckCircle2 size={20} className="text-emerald-500" />
                </div>
              ) : (
                <button 
                  className="rss-add-btn" 
                  title="뉴스 카드로 추가"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddNews(item.link);
                  }}
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          </motion.div>
        ))}
        {rssItems.length === 0 && !isRssLoading && (
          <div className="no-result" style={{fontSize: '0.8rem', opacity: 0.6}}>기사를 불러오는 중이거나 목록이 비어있습니다.</div>
        )}
      </div>
    </>
  );

  return (
    <div className="discovery-container">
      <header className="header">
        <div className="header-content">
          <div 
            className="logo-link" 
            onClick={() => {
              setShowOnlyLiked(false);
              setSelectedCategory('All');
              setSearchTerm('');
              setSelectedDate('');
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="logo">AI Bongchae</div>
          </div>
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
              className="export-btn"
              onClick={showOnlyLiked ? handleExportPPT : handleExportExcel}
              title={showOnlyLiked ? "좋아요 뉴스 PPT로 내보내기" : "전체 뉴스 엑셀로 내보내기"}
            >
              {showOnlyLiked ? '📊 PPT 만들기' : '📊 엑셀 Export'}
            </button>
            <button 
              className={`filter-btn ${showOnlyLiked ? 'active' : ''}`}
              onClick={() => setShowOnlyLiked(!showOnlyLiked)}
            >
              {showOnlyLiked ? '전체 보기' : '좋아요 목록'}
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar Exploration */}
      <aside className="discovery-sidebar">
        <DiscoveryContent />
      </aside>

      {/* Main Core Content */}
      <main className={`app-content ${navTab === 'discover' ? 'hidden-mobile' : ''}`}>

        <div className="url-input-container">
          <div className="url-input-group">
            <input 
              type="text" 
              className="url-field" 
              placeholder="뉴스 URL을 입력하세요..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddNews()}
              disabled={isProcessing}
            />
            <button 
              className="add-btn" 
              onClick={() => handleAddNews()}
              disabled={isProcessing || !urlInput}
            >
              <Plus size={18} />
              <span>{isProcessing ? '⚡ 처리 중' : '뉴스 추가'}</span>
            </button>
          </div>
          {isProcessing && (
            <>
              <div className="loading-bar-container">
                <div className="loading-bar" style={{width: `${loadingProgress || 30}%`}}></div>
              </div>
              <div className="loading-text">보안 사이트 여부를 확인하며 AI 분석 중입니다...</div>
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
                <select 
                  className="manual-field manual-category-input"
                  style={{appearance: 'auto', background: 'rgba(15, 23, 42, 0.6)', color: 'white'}}
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                >
                  <option value="">카테고리 선택 (필수)</option>
                  <option value="AI">AI</option>
                  <option value="Robot">Robot</option>
                  <option value="IT">IT</option>
                  <option value="보안">보안</option>
                  <option value="기타">기타</option>
                </select>
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

        <div className="news-feed">
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
                      <button 
                        className={`like-btn ${news.likes ? 'active' : ''}`} 
                        onClick={(e) => toggleLike(e, news.id, news.likes)}
                        title={news.likes ? '좋아요 취소' : '좋아요'}
                        type="button"
                      >
                        <span className={`like-icon ${news.likes ? 'active' : ''}`}>
                          {news.likes ? '❤️' : '🤍'}
                        </span>
                        <span className="like-count">
                          {news.likes ? 1 : 0}
                        </span>
                      </button>
                      <span className="ai-source-info">
                        {news.engine && news.engine.includes('(수동)') ? 
                          `${news.engine.replace('(수동)', '').trim()}가 요약했습니다. (사용자가 직접 등록)` : 
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
        </div>
      </main>

      {/* Mobile Bottom Sheets */}
      <div className="mobile-nav-bar">
        <button 
          className={`nav-item ${navTab === 'home' ? 'active' : ''}`}
          onClick={() => { setNavTab('home'); setIsDiscoveryOpen(false); }}
        >
          <List size={20} />
          <span>보관함</span>
        </button>
        <button 
          className={`nav-item ${navTab === 'discover' ? 'active' : ''}`}
          onClick={() => { setIsDiscoveryOpen(true); setNavTab('discover'); }}
        >
          <Compass size={20} />
          <span>발견</span>
        </button>
      </div>

      <AnimatePresence>
        {isDiscoveryOpen && (
          <>
            <motion.div 
              className="bottom-sheet-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDiscoveryOpen(false)}
            />
            <motion.div 
              className="bottom-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="sheet-handle" onClick={() => setIsDiscoveryOpen(false)} />
              <DiscoveryContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
