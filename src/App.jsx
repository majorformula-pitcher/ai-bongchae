import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Compass, List, Plus, X, ChevronUp, 
  RefreshCw, Zap, ExternalLink, CheckCircle2 
} from 'lucide-react';
import './index.css';

const API_URL = ''; // 백엔드 통신 주소 복구

const DiscoveryContent = React.memo(({ 
  isRssLoading, 
  rssFeeds, 
  selectedFeedId, 
  setSelectedFeedId, 
  rssItems, 
  processingUrls, 
  handleAddNews 
}) => (
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
                  handleAddNews(item.link, item.title); // [개선] 제목 전달
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
));

function App() {
  const [newsList, setNewsList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showOnlyLiked, setShowOnlyLiked] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  
  const [urlInput, setUrlInput] = useState('');
  const [captureItem, setCaptureItem] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [processingType, setProcessingType] = useState('news'); // 'news' or 'email'

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

  // [편집 기능] 뉴스 카드 수동 수정을 위한 상태
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');

  // DB에서 뉴스 읽어오기 (서버 API 경유)
  const fetchNews = async () => {
    try {
      const res = await axios.get('/api/news');
      if (res.data.success) {
        setNewsList(res.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching news:', error);
    }
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
          if (data.feeds.length > 0) setSelectedFeedId(data.feeds[0].id);
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

  const handleAddNews = async (targetUrl = null, defaultTitle = null) => {
    const finalUrl = targetUrl || urlInput;
    if (!finalUrl || !finalUrl.startsWith('http')) {
      alert('올바른 URL을 입력해주세요.');
      return;
    }

    if (processingUrls.has(finalUrl)) return; // 이미 처리 중이면 중단

    setIsProcessing(true);
    setProcessingType('news');
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
        
        // 제목 정제 헬퍼 (매체명 접미사 제거)
        const cleanTitle = (t) => t.replace(/\s*[-|:|/]\s*(더밀크\s*\|\s*The\s*Miilk|더밀크|Bloomberg\.com|Bloomberg|CNBC|The Verge|NYT|Reuters|Financial Times|FT|TechCrunch|VentureBeat|CNET|Wired).*$/i, '').trim();

        // [우선순위] 이미 알고 있는 제목(RSS) > 서버에서 준 제목 순으로 세팅
        if (defaultTitle) setManualTitle(cleanTitle(defaultTitle));
        else if (result.title) setManualTitle(cleanTitle(result.title));
        
        setManualMode(true);
        setIsProcessing(false);
        setLoadingProgress(0);
        return;
      }

      setLoadingProgress(80);

      // 2. 서버 API를 통한 DB 저장
      const res = await axios.post('/api/news', {
        title: result.title,
        summary: result.summary,
        url: result.url,
        category: result.category,
        published_at: result.published_at,
        image: result.image,
        engine: result.engine,
        likes: false
      });

      if (!res.data.success) throw new Error('DB 저장에 실패했습니다.');

      const savedData = res.data.data[0];

      // 3. 상태 업데이트 및 알림 (함수형 업데이트로 유실 방지)
      setNewsList(prev => [savedData, ...prev]);
      if (!targetUrl) setUrlInput('');
      
      // RSS 리스트 상태 업데이트 (목록에서 '추가됨' 표시를 위해)
      if (targetUrl) {
          setRssItems(prev => prev.map(item => 
              item.link === targetUrl ? { ...item, isAdded: true } : item
          ));
      }

      setLoadingProgress(100);
      setTimeout(() => setLoadingProgress(0), 1000);
    } catch (err) {
      console.error('Email Send Error:', err);
      
      // [정밀 진단] 상세 에러 메시지 구성
      let detailedMsg = err.message;
      if (err.response) {
        // 서버가 응답을 준 경우 (예: 413, 500 등)
        detailedMsg = `[Status: ${err.response.status}] ${JSON.stringify(err.response.data || 'No details')}`;
      } else if (err.request) {
        // 서버에 요청은 갔으나 응답을 못 받은 경우 (Timeout)
        detailedMsg = '서버로부터 응답이 없습니다. (서버 타임아웃 또는 프로세스 다운)';
      }
      
      alert(`발송 중 오류가 발생했습니다:\n${detailedMsg}`);
    } finally {
      setProcessingUrls(prev => {
        const next = new Set(prev);
        next.delete(finalUrl);
        // 모든 요약 작업이 진짜로 다 끝났을 때만 버튼을 원래대로 돌림
        if (next.size === 0) setIsProcessing(false);
        return next;
      });
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

      // 서버 API를 통한 저장
      const res = await axios.post('/api/news', {
        title: finalTitle,
        summary: finalSummary,
        url: urlInput || `manual-${Date.now()}`,
        category: finalCategory || '기타',
        published_at: new Date().toISOString().split('T')[0],
        engine: finalEngine,
        likes: false
      });

      if (!res.data.success) throw new Error('수동 저장에 실패했습니다.');
      
      const savedData = res.data.data[0];
      setNewsList(prev => [savedData, ...prev]);
      setUrlInput('');
      setManualMode(false);
      setManualTitle('');
      setManualSummary('');
      setManualCategory('');
    } catch (error) {
      alert('등록 중 오류 발생: ' + error.message);
    } finally {
      // 처리 중인 다른 작업이 없을 때만 버튼 상태 원복
      setProcessingUrls(prev => {
        const next = new Set(prev);
        // 수동 모드의 경우 고유 ID 등을 쓰지 않으므로 개수 기반 혹은 단순 체크
        if (next.size === 0) setIsProcessing(false);
        return next;
      });
    }
  };

  const handleDelete = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm('정말 삭제하시겠습니까?')) {
      try {
        // 삭제할 뉴스의 URL 정보를 미리 확보 (RSS 버튼 복구용)
        const targetNews = newsList.find(n => n.id === id);
        
        const res = await axios.delete(`/api/news/${id}`);
        if (res.data.success) {
          // 1. 메인 뉴스 목록에서 제거
          setNewsList(prev => prev.filter(news => news.id !== id));

          // 2. RSS 발견 목록의 버튼 상태 복구 (+ 버튼으로 다시 변경)
          if (targetNews && targetNews.url) {
            setRssItems(prev => prev.map(item => 
              item.link === targetNews.url ? { ...item, isAdded: false } : item
            ));
          }
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert('삭제 중 오류 발생: ' + error.message);
      }
    }
  };

  const toggleLike = async (e, id, currentStatus) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      // 회사 보안망 호환성을 위해 patch를 post로 변경
      const res = await axios.post(`/api/news/${id}/like`, { currentStatus });
      
      if (res.data.success) {
        setNewsList(prevList => prevList.map(news => 
          news.id === id ? { ...news, likes: !currentStatus } : news
        ));
      } else {
        throw new Error(res.data.error || '알 수 없는 오류');
      }
    } catch (err) {
      console.error('Like exception:', err);
      alert(`좋아요 처리 중 오류가 발생했습니다.\n\n[상세]: ${err.message}`);
    }
  };
  
  const handleExportExcel = async () => {
    try {
      const res = await axios.get('/api/news');
      if (!res.data.success) throw new Error('데이터를 불러오지 못했습니다.');
      const data = res.data.data;

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
                x: 7.2, y: 1.8, w: 1.75, h: 1.3,
                sizing: { type: 'contain', w: 1.75, h: 1.3 }
              });
            } catch (imgErr) {
              console.warn('Image skip due to error:', imgErr);
            }
          }

          // 슬라이드 노트에 원본 URL 추가
          slide.addNotes(`원본 기사 링크: ${news.url}`);
        }
        
        await pres.writeFile({ fileName: `AI_Bongchae_PPT_${new Date().toLocaleDateString()}.pptx` });
      };

      generateSlides();
    } catch (err) {
      console.error('PPT Export Error:', err);
      alert('PPT 생성 중 오류가 발생했습니다.');
    }
  };

  const handleSendEmail = async () => {
    if (filteredNews.length === 0) {
      alert('보낼 뉴스가 없습니다.');
      return;
    }

    if (filteredNews.length > 10) {
      alert('Email 로 보낼 수 있는 뉴스는 10개까지입니다.');
      return;
    }

    const confirmSend = window.confirm(`현재 필터링된 ${filteredNews.length}개의 뉴스를 실제 PPT 디자인 슬라이드 리포트로 발송할까요?\n(이미지 클릭 시 원본 기사가 연결됩니다.)`);
    if (!confirmSend) return;

    try {
      setIsProcessing(true);
      setProcessingType('email');
      setLoadingProgress(5);
      
      const images = [];

      // 순차적으로 가상 슬라이드 캡처
      for (let i = 0; i < filteredNews.length; i++) {
        const news = filteredNews[i];
        
        // 1. 캡처용 데이터 주입
        setCaptureItem(news);
        setLoadingProgress(5 + Math.floor((i / filteredNews.length) * 70));
        
        // 2. DOM이 렌더링되고 이미지가 로드될 시간을 줍니다.
        await new Promise(resolve => setTimeout(resolve, 800)); 
        
        const element = document.getElementById('email-capture-template');
        if (element) {
          // 3. AWS 최적화 고해상도 캡처 (800px * scale 1.6)
          const canvas = await html2canvas(element, {
            useCORS: true,
            allowTaint: true,
            scale: 1.6, 
            backgroundColor: '#ffffff',
            logging: false
          });
          
          images.push(canvas.toDataURL('image/jpeg', 0.7));
        }
      }

      setLoadingProgress(85);

      // 4. 백엔드로 데이터 전송 (초고화질 대용량 처리를 위해 600초 타임아웃 설정)
      const response = await axios.post('/api/send-email', {
        newsList: filteredNews,
        images: images
      }, {
        timeout: 600000 // 600초 대기
      });

      if (response.data.success) {
        const { total, successCount, results } = response.data;
        const failed = results?.filter(r => !r.success) || [];
        
        let msg = `총 ${total}명 중 ${successCount}명에게 리포트 발송 성공! ✉️🚀`;
        if (failed.length > 0) {
          msg += `\n\n⚠️ 일부 실패 (${failed.length}건):\n` + failed.map(f => `- ${f.to}: ${f.error}`).join('\n');
        }
        
        alert(msg);
      } else {
        throw new Error(response.data.error || '발송 실패');
      }
    } catch (err) {
      console.error('Email Send Error:', err);
      
      // [정밀 진단] 상세 에러 메시지 구성 (AWS 환경 대응)
      let detailedMsg = err.message;
      if (err.response) {
        // 서버가 응답을 준 경우 (413, 500 등)
        detailedMsg = `[서버 상태 코드: ${err.response.status}] ${JSON.stringify(err.response.data || '상세 정보 없음')}\n\n*데이터 용량이 ${loadingProgress}% 지점에서 초과했을 수 있습니다.`;
      } else if (err.request) {
        // 서버로 요청은 갔으나 응답이 없는 경우 (타임아웃 또는 연결 강제 종료)
        detailedMsg = `서버로부터 응답이 없습니다. (Timeout 또는 AWS 네트워크 강제 종료)\n\n[진단]: 고해상도 이미지 데이터가 너무 커서 AWS 환경에서 전송 중 연결이 차단(Drop)되었을 가능성이 큽니다.`;
      }
      
      alert(`발송 중 오류가 발생했습니다:\n\n${detailedMsg}\n\n[해결책]: 1. 뉴스 카드를 2-3개로 줄여서 테스트해보세요.\n2. AWS 서버 터미널의 로그(Payload Size)를 확인해주세요.`);
    } finally {
      setIsProcessing(false);
      setCaptureItem(null);
      setLoadingProgress(0);
    }
  };

  // [뉴스 수정] 제목과 요약을 DB에 업데이트합니다.
  const handleUpdateNews = async (id) => {
    try {
      const response = await axios.put(`/api/news/${id}`, {
        title: editTitle,
        summary: editSummary
      });

      if (response.data.success) {
        setNewsList(prev => prev.map(news => 
          news.id === id ? { ...news, title: editTitle, summary: editSummary } : news
        ));
        setEditingId(null);
      }
    } catch (err) {
      console.error('Update News Error:', err);
      alert('수정 중 오류가 발생했습니다.');
    }
  };

  const startEditing = (news) => {
    setEditingId(news.id);
    setEditTitle(news.title);
    setEditSummary(news.summary || '');
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


  return (
    <div className="discovery-container">
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
              className="export-btn"
              onClick={showOnlyLiked ? handleExportPPT : handleExportExcel}
              title={showOnlyLiked ? "좋아요 뉴스 PPT로 내보내기" : "전체 뉴스 엑셀로 내보내기"}
            >
              {showOnlyLiked ? '📊 PPT 만들기' : '📊 엑셀 Export'}
            </button>
            {showOnlyLiked && (
              <button 
                className="export-btn mail-btn" 
                onClick={handleSendEmail}
                title="이메일로 요약 보고서 보내기"
              >
                📧 Email 보내기
              </button>
            )}
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
        <DiscoveryContent 
          isRssLoading={isRssLoading}
          rssFeeds={rssFeeds}
          selectedFeedId={selectedFeedId}
          setSelectedFeedId={setSelectedFeedId}
          rssItems={rssItems}
          processingUrls={processingUrls}
          handleAddNews={handleAddNews}
        />
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
              <div key={news.id} id={`news-card-${news.id}`} className="news-card">
                <div className="news-category-badge">{news.category}</div>
                <button className="delete-btn" title="뉴스 삭제" onClick={(e) => handleDelete(e, news.id)}>×</button>
                <a href={news.url} target="_blank" rel="noopener noreferrer" className="news-image-container">
                  {news.image ? (
                    <img 
                      src={`/api/proxy-image?url=${encodeURIComponent(news.image)}`} 
                      alt={news.title} 
                      className="news-image" 
                      crossOrigin="anonymous" 
                    />
                  ) : (
                    <div className="news-image-placeholder">
                      <span>이미지가 없는 뉴스입니다</span>
                    </div>
                  )}
                </a>
                <div className="news-content">
                  <h2 className="news-title">
                    {editingId === news.id ? (
                      <input 
                        type="text" 
                        className="edit-title-input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <a href={news.url} target="_blank" rel="noopener noreferrer" style={{color: 'inherit', textDecoration: 'none'}}>
                        {news.title}
                      </a>
                    )}
                  </h2>
                  <div className="news-summary-container">
                    {editingId === news.id ? (
                      <textarea 
                        className="edit-summary-input"
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        rows={6}
                      />
                    ) : (
                      <ul className="news-summary">
                        {(news.summary || '').split('\n').filter(line => line.trim()).map((line, idx) => (
                          <li key={idx}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                    <div className="action-bar">
                      <div className="action-left">
                        <div className="action-btns-row">
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
                          
                          <button 
                            className={`edit-mode-btn ${editingId === news.id ? 'save-mode' : ''}`}
                            onClick={() => editingId === news.id ? handleUpdateNews(news.id) : startEditing(news)}
                            title={editingId === news.id ? '저장' : '수정'}
                          >
                            {editingId === news.id ? '💾' : '✏️'}
                          </button>

                          {editingId === news.id && (
                            <button 
                              className="edit-cancel-btn"
                              onClick={() => setEditingId(null)}
                              title="취소"
                            >
                              ✖️
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="action-right-info">
                        <span className="ai-combined-info">
                          {news.engine && news.engine.includes('(수동)') ? 
                            `${news.engine.replace('(수동)', '').trim()}가 요약` : 
                            news.engine && news.engine !== 'User' ? `${news.engine}가 요약` : 
                            news.engine === 'User' ? '사용자 직접 등록' : ''}
                          
                          {news.created_at && (
                            <span className="info-date-text">
                              {(() => {
                                const val = news.created_at;
                                const dateStr = (val.includes('Z') || val.includes('+')) ? val : (val.includes(' ') ? val.replace(' ', 'T') + 'Z' : val + 'Z');
                                const formatted = new Date(dateStr).toLocaleString('ko-KR', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                }).replace(/(\d{4}). (\d{2}). (\d{2})./, '$1.$2.$3.');
                                return ` (${formatted})`;
                              })()}
                            </span>
                          )}
                        </span>
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
              <DiscoveryContent 
                isRssLoading={isRssLoading}
                rssFeeds={rssFeeds}
                selectedFeedId={selectedFeedId}
                setSelectedFeedId={setSelectedFeedId}
                rssItems={rssItems}
                processingUrls={processingUrls}
                handleAddNews={handleAddNews}
              />
            </motion.div>
          </>
        )}
        {/* 캡처 로딩 오버레이 */}
        {isProcessing && loadingProgress > 0 && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <RefreshCw className="animate-spin text-primary mb-4" size={48} />
            <div style={{color: 'white', fontSize: '1.2rem', fontWeight: 'bold'}}>
              {processingType === 'email' ? 'PPT 슬라이드 캡처 및 발송 중...' : 'AI 분석 및 뉴스 카드 생성 중...'} ({loadingProgress}%)
            </div>
            <div style={{width: '300px', height: '8px', background: '#334155', borderRadius: '4px', marginTop: '20px', overflow: 'hidden'}}>
              <div style={{width: `${loadingProgress}%`, height: '100%', background: '#8b5cf6', transition: 'width 0.3s ease'}} />
            </div>
          </div>
        )}

        {/* 캡처용 가상 슬라이드 템플릿 (숨겨짐) */}
        {captureItem && (
          <div id="email-capture-template" className="slide-capture-area">
            <div className="slide-capture-header">
              <h1 className="slide-capture-title">{captureItem.title}</h1>
            </div>
            <div className="slide-capture-body">
              <div className="slide-capture-content">
                <ul className="slide-capture-bullet-list">
                  {(captureItem.summary || '').split('\n').filter(l => l.trim()).map((line, idx) => (
                    <li key={idx} className="slide-capture-bullet-item">{line}</li>
                  ))}
                </ul>
              </div>
              <div className="slide-capture-image-box">
                {captureItem.image && (
                  <img 
                    src={`/api/proxy-image?url=${encodeURIComponent(captureItem.image)}`} 
                    className="slide-capture-img" 
                    crossOrigin="anonymous" 
                  />
                )}
              </div>
            </div>
            <div className="slide-capture-footer">
              <span className="slide-capture-source">Source: {captureItem.engine || 'AI Bongchae'}</span>
              <span className="slide-capture-date">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}. News Report</span>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
