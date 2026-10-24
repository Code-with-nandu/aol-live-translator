import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Headphones,
  Wifi,
  WifiOff,
  Maximize2,
  Sparkles,
  Info,
  Play,
  RotateCcw,
  Check,
  AlertTriangle,
  Type,
  Eye,
  EyeOff,
  Radio
} from 'lucide-react';
import { SubtitleItem, ConnectionStatus } from '../types';
import { StudentAudioPlayer } from '../services/audioPlayer';

interface Props {
  sessionId: string;
  onOpenGuide: () => void;
  isSimulated?: boolean;
  studentIndex?: number;
  onLeaveSession?: () => void;
}

export const StudentView: React.FC<Props> = ({
  sessionId,
  onOpenGuide,
  isSimulated = false,
  studentIndex = 1,
  onLeaveSession,
}) => {
  const [sessionTitle, setSessionTitle] = useState('Art of Living Classroom');
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isTeacherLive, setIsTeacherLive] = useState(false);
  const [isTeacherMuted, setIsTeacherMuted] = useState(false);
  const [teacherConnected, setTeacherConnected] = useState(false);
  const [studentCount, setStudentCount] = useState(1);
  const [studentId] = useState(() => `student-${studentIndex}-${Math.random().toString(36).substring(2, 6)}`);

  // Audio player state
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isTestingAudio, setIsTestingAudio] = useState(false);

  // Subtitle presentation controls
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('large');
  const [showEnglish, setShowEnglish] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioPlayerRef = useRef<StudentAudioPlayer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subtitleEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize AudioPlayer
  useEffect(() => {
    const player = new StudentAudioPlayer((playing) => {
      setIsPlayingAudio(playing);
    });
    audioPlayerRef.current = player;

    return () => {
      player.close();
    };
  }, []);

  // Update volume in player
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(volume);
    }
  }, [volume]);

  // Update mute in player
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setMuted(isMuted || !audioEnabled);
    }
  }, [isMuted, audioEnabled]);

  // Auto scroll subtitles
  useEffect(() => {
    subtitleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [subtitles]);

  // Connect WebSocket
  useEffect(() => {
    let reconnectTimeout: any = null;
    let isCancelled = false;

    const connectWs = () => {
      if (isCancelled) return;
      setConnectionStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?role=student&sessionId=${encodeURIComponent(
        sessionId
      )}&studentId=${encodeURIComponent(studentId)}&studentName=Student+${studentIndex}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCancelled) return;
          setConnectionStatus('connected');
          setErrorMessage(null);
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'INIT_STUDENT') {
              if (data.title) setSessionTitle(data.title);
              setIsTeacherLive(!!data.isLive);
              setIsTeacherMuted(!!data.isMuted);
              setTeacherConnected(!!data.teacherConnected);
              if (data.studentCount) setStudentCount(data.studentCount);
              if (Array.isArray(data.recentSubtitles) && data.recentSubtitles.length > 0) {
                setSubtitles(data.recentSubtitles);
              }
            } else if (data.type === 'TRANSLATION_BROADCAST') {
              const newSub: SubtitleItem = data.subtitle;
              if (newSub) {
                setSubtitles((prev) => {
                  const filtered = prev.filter((s) => s.id !== newSub.id);
                  return [...filtered, newSub];
                });

                // Play audio if student enabled audio
                if (audioEnabled && audioPlayerRef.current) {
                  audioPlayerRef.current.queueAudio(data.audioBase64, newSub.hindi);
                }
              }
            } else if (data.type === 'SESSION_LIVE_STATE') {
              setIsTeacherLive(!!data.isLive);
            } else if (data.type === 'TEACHER_MUTED_STATE') {
              setIsTeacherMuted(!!data.isMuted);
            } else if (data.type === 'TEACHER_STATUS') {
              setTeacherConnected(!!data.teacherConnected);
              setIsTeacherLive(!!data.isLive);
            } else if (data.type === 'STUDENT_COUNT_CHANGE') {
              setStudentCount(data.studentCount);
            }
          } catch (err) {
            console.error('Error parsing WS message:', err);
          }
        };

        ws.onerror = (e) => {
          console.warn('Student WS error:', e);
          setConnectionStatus('error');
          setErrorMessage('Connection issue detected. Reconnecting automatically...');
        };

        ws.onclose = () => {
          if (isCancelled) return;
          setConnectionStatus('reconnecting');
          reconnectTimeout = setTimeout(connectWs, 2500);
        };
      } catch (err: any) {
        setConnectionStatus('error');
        setErrorMessage(err.message || 'Failed to establish connection');
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId, studentId, studentIndex]);

  // Handle unlocking audio on mobile
  const handleUnlockAudio = async () => {
    if (audioPlayerRef.current) {
      const ok = await audioPlayerRef.current.unlock();
      if (ok) {
        setAudioUnlocked(true);
        // Play short chime or test greeting
        handleTestAudio();
      }
    }
  };

  // Test earphone audio
  const handleTestAudio = async () => {
    if (!audioPlayerRef.current) return;
    setIsTestingAudio(true);
    try {
      await audioPlayerRef.current.unlock();
      setAudioUnlocked(true);

      const res = await fetch('/api/test-audio');
      const data = await res.json();
      if (data.audioBase64) {
        audioPlayerRef.current.queueAudio(data.audioBase64, data.text);
      }
    } catch (err) {
      console.warn('Test audio error:', err);
    } finally {
      setTimeout(() => setIsTestingAudio(false), 2000);
    }
  };

  const currentSubtitle = subtitles.length > 0 ? subtitles[subtitles.length - 1] : null;

  const fontClasses = {
    normal: 'text-2xl sm:text-3xl leading-relaxed',
    large: 'text-3xl sm:text-4xl lg:text-5xl leading-snug font-bold',
    xlarge: 'text-4xl sm:text-5xl lg:text-6xl leading-tight font-extrabold',
  }[fontSize];

  return (
    <div className="flex flex-col h-full bg-stone-950 text-stone-100 select-none">
      {/* Top Mobile App Bar */}
      <header className="px-4 py-3 bg-stone-900/90 border-b border-stone-800/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-stone-950 font-black shadow-md shadow-amber-500/10">
            ॐ
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-amber-200 tracking-wide truncate max-w-[170px] sm:max-w-xs">
                {sessionTitle}
              </h1>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700">
                {sessionId}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-stone-400">
              <span className="flex items-center gap-1">
                {connectionStatus === 'connected' ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ) : (
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                )}
                {connectionStatus === 'connected' ? 'लाइव कनेक्टेड' : 'रीकनेक्टिंग...'}
              </span>
              <span>•</span>
              <span>{studentCount} छात्र जुड़े हैं</span>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowEnglish(!showEnglish)}
            className={`p-2 rounded-lg text-xs font-medium transition flex items-center gap-1 border ${
              showEnglish
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-stone-800/80 text-stone-400 border-stone-700 hover:text-stone-200'
            }`}
            title="Toggle original English"
            aria-label="Toggle English transcript"
          >
            {showEnglish ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="text-[10px]">EN</span>
          </button>

          <button
            onClick={() => {
              setFontSize((prev) => (prev === 'normal' ? 'large' : prev === 'large' ? 'xlarge' : 'normal'));
            }}
            className="p-2 rounded-lg bg-stone-800/80 hover:bg-stone-700/80 text-stone-300 border border-stone-700 transition"
            title="Adjust text size"
            aria-label="Adjust font size"
          >
            <Type className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onOpenGuide}
            className="p-2 rounded-lg bg-stone-800/80 hover:bg-stone-700/80 text-stone-300 border border-stone-700 transition"
            title="Setup Help"
            aria-label="Help"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Classroom Status Ribbon */}
      <div className="px-4 py-2 bg-stone-900/60 border-b border-stone-800/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {isTeacherLive ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" />
              <span>सत्र सक्रिय है (Session Active)</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>शिक्षक की प्रतीक्षा (Waiting for Teacher)</span>
            </span>
          )}

          {isTeacherMuted && (
            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]">
              शिक्षक म्यूट हैं
            </span>
          )}
        </div>

        {/* Earphone audio indicator */}
        <div className="flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] text-stone-300">ईयरफ़ोन अनुशंसित</span>
        </div>
      </div>

      {/* Audio Unlock Banner on Mobile */}
      {!audioUnlocked && (
        <div className="p-4 mx-4 mt-3 rounded-2xl bg-gradient-to-r from-amber-600/20 to-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-stone-950 font-bold shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-200">ईयरफ़ोन ध्वनि सक्षम करें (Enable Earphone Audio)</h3>
              <p className="text-xs text-stone-300">
                अपने फ़ोन में हिंदी अनुवाद सुनने के लिए नीचे दिए गए बटन पर टैप करें।
              </p>
            </div>
          </div>
          <button
            onClick={handleUnlockAudio}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs uppercase tracking-wider transition shadow-md shadow-amber-500/30 flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-stone-950" />
            <span>ध्वनि चालू करें (Start Audio)</span>
          </button>
        </div>
      )}

      {/* Main Subtitle Display Area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col justify-end">
        {subtitles.length === 0 ? (
          <div className="my-auto text-center py-12 px-4 space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
              <Headphones className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-hindi text-amber-100">
                आर्ट ऑफ लिविंग लाइव हिंदी अनुवाद
              </h2>
              <p className="text-xs text-stone-400 mt-1">
                शिक्षक कक्षा में अंग्रेजी में बोलेंगे, और आपको यहाँ तुरंत हिंदी अनुवाद और ध्वनि सुनाई देगी।
              </p>
            </div>

            <div className="pt-2 flex flex-col items-center gap-2">
              <button
                onClick={handleTestAudio}
                disabled={isTestingAudio}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-2 transition"
              >
                <Volume2 className="w-4 h-4" />
                <span>{isTestingAudio ? 'ध्वनि परीक्षण जारी...' : 'ईयरफ़ोन ध्वनि परीक्षण (Test Earphone Sound)'}</span>
              </button>
              <span className="text-[10px] text-stone-500">
                क्लिक करके सुनिश्चित करें कि आपके ईयरफ़ोन में आवाज़ आ रही है
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Earlier subtitles in faded look */}
            {subtitles.slice(-4, -1).map((sub) => (
              <div
                key={sub.id}
                className="p-3 rounded-xl bg-stone-900/40 border border-stone-800/40 opacity-60 transition"
              >
                <p className="text-stone-300 font-hindi text-lg sm:text-xl leading-relaxed">
                  {sub.hindi}
                </p>
                {showEnglish && (
                  <p className="text-stone-500 text-xs mt-1 italic">
                    "{sub.english}"
                  </p>
                )}
              </div>
            ))}

            {/* Current Active Live Subtitle (Large, High Contrast) */}
            {currentSubtitle && (
              <div className="p-5 sm:p-7 rounded-2xl bg-gradient-to-b from-stone-900 to-stone-900/90 border-2 border-amber-500/50 shadow-2xl shadow-amber-500/5 transition transform duration-300 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between pb-2 border-b border-stone-800 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 font-hindi">
                      लाइव अनुवाद (Live Translation)
                    </span>
                  </div>

                  {isPlayingAudio && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-300">
                      <span className="wave-bar w-1 bg-amber-400 rounded-full" />
                      <span className="wave-bar w-1 bg-amber-400 rounded-full [animation-delay:0.2s]" />
                      <span className="wave-bar w-1 bg-amber-400 rounded-full [animation-delay:0.4s]" />
                      <span className="text-[10px] ml-1">बोल रहे हैं...</span>
                    </div>
                  )}
                </div>

                {/* Big Hindi Text */}
                <p className={`font-hindi text-amber-100 ${fontClasses} tracking-normal`}>
                  {currentSubtitle.hindi}
                </p>

                {/* Original English Speech if toggled */}
                {showEnglish && (
                  <div className="mt-3 pt-3 border-t border-stone-800 text-xs text-stone-400 flex items-start gap-1.5">
                    <span className="text-stone-500 font-semibold shrink-0">EN:</span>
                    <span className="italic">{currentSubtitle.english}</span>
                  </div>
                )}
              </div>
            )}
            <div ref={subtitleEndRef} />
          </div>
        )}
      </main>

      {/* Bottom Controls Bar: Volume, Audio Toggle, Sound Test */}
      <footer className="p-3.5 bg-stone-900 border-t border-stone-800 shrink-0">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 max-w-xl mx-auto">
          {/* Audio toggle & Mute */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <button
              onClick={() => {
                if (!audioUnlocked) {
                  handleUnlockAudio();
                } else {
                  setIsMuted(!isMuted);
                }
              }}
              className={`p-2.5 rounded-xl flex items-center gap-2 text-xs font-semibold border transition ${
                isMuted || !audioEnabled
                  ? 'bg-stone-800 text-stone-400 border-stone-700'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              {isMuted || !audioEnabled ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isMuted ? 'म्यूट (Muted)' : 'हिंदी ध्वनि (Audio ON)'}</span>
            </button>

            <button
              onClick={handleTestAudio}
              disabled={isTestingAudio}
              className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 text-xs transition flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 text-amber-400" />
              <span>{isTestingAudio ? 'परीक्षण...' : 'ध्वनि परीक्षण'}</span>
            </button>
          </div>

          {/* Independent Student Volume Slider */}
          <div className="flex items-center gap-2.5 w-full sm:w-64">
            <Volume2 className="w-4 h-4 text-stone-400 shrink-0" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              aria-label="Student volume control"
            />
            <span className="text-[11px] text-stone-400 font-mono w-9 text-right shrink-0">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
