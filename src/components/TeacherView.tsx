import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Square,
  QrCode,
  Copy,
  Check,
  Users,
  Sparkles,
  Volume2,
  AlertCircle,
  HelpCircle,
  Send,
  RefreshCw,
  Sliders,
  Share2,
  ExternalLink,
  ChevronDown,
  Layers
} from 'lucide-react';
import { SubtitleItem, StudentInfo, SpiritualCategory } from '../types';
import { TeacherSpeechRecognizer } from '../services/speechRecognizer';

interface Props {
  sessionId: string;
  onOpenGuide: () => void;
  onOpenSimulator: () => void;
}

const CATEGORIES: SpiritualCategory[] = [
  {
    id: 'satsang_kriya',
    name: 'Sudarshan Kriya & Breathwork',
    hindiName: 'सुदर्शन क्रिया एवं प्राणायाम',
    description: 'Tuned for Pranayama, Ujjayi breath, Soham, Bhastrika, and rhythmic breathing.',
    samplePhrases: [
      'Welcome everyone to the Art of Living classroom.',
      'Take a deep breath in, hold gently, and breathe out.',
      'Now let us begin with three stages of Pranayama with Ujjayi breath.',
      'Keep your spine erect, shoulders relaxed, and a gentle smile on your face.',
      'Sudarshan Kriya starts now. Follow the rhythm of the breath.',
      'Relax completely and let go of all effort.',
    ],
  },
  {
    id: 'meditation',
    name: 'Guided Meditation & Silence',
    hindiName: 'ध्यान एवं मौन',
    description: 'Tuned for Sahaj Samadhi, deep rest, inner peace, and letting go.',
    samplePhrases: [
      'Gently close your eyes and become aware of your body.',
      'You are peace. You are joy. Rest in this moment.',
      'Accept all thoughts as they come and let them pass like clouds.',
      'Deep rest is the beginning of dynamic activity.',
      'Slowly and gradually, you may open your eyes.',
    ],
  },
  {
    id: 'wisdom',
    name: 'Wisdom & Knowledge Sheets',
    hindiName: 'ज्ञान चर्चा एवं सत्संग',
    description: 'Tuned for Satsang talks, Seva, Sadhana, Karma, and Gurudev teachings.',
    samplePhrases: [
      'Knowledge is that which unites the mind with the present moment.',
      'Opposites are complementary in life.',
      'When you do Seva, true joy awakens from within.',
      'Faith is knowing that everything will be taken care of.',
    ],
  },
  {
    id: 'general',
    name: 'General Classroom Q&A',
    hindiName: 'सामान्य कक्षा चर्चा',
    description: 'General classroom dialogue, logistics, and student questions.',
    samplePhrases: [
      'Does anyone have a question about today\'s practice?',
      'Please make sure your earphones are comfortable.',
      'Drink some water and stay hydrated after the kriya.',
    ],
  },
];

export const TeacherView: React.FC<Props> = ({ sessionId, onOpenGuide, onOpenSimulator }) => {
  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micStatus, setMicStatus] = useState<'idle' | 'listening' | 'denied' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Session & students
  const [sessionTitle, setSessionTitle] = useState('Art of Living Classroom');
  const [category, setCategory] = useState('satsang_kriya');
  const [joinUrl, setJoinUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [studentList, setStudentList] = useState<StudentInfo[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Translation stream & input
  const [recentSubtitles, setRecentSubtitles] = useState<SubtitleItem[]>([]);
  const [interimSpeech, setInterimSpeech] = useState('');
  const [manualText, setManualText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const recognizerRef = useRef<TeacherSpeechRecognizer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const categoryRef = useRef(category);
  const phraseQueueRef = useRef<string[]>([]);
  const isProcessingQueueRef = useRef(false);
  const lastSpokenPhraseRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  // Process phrase queue sequentially to prevent dropping teacher speech
  const processPhraseQueue = async () => {
    if (isProcessingQueueRef.current || phraseQueueRef.current.length === 0) return;
    isProcessingQueueRef.current = true;
    setIsProcessing(true);

    while (phraseQueueRef.current.length > 0) {
      const englishText = phraseQueueRef.current.shift();
      if (!englishText) continue;

      try {
        const res = await fetch('/api/translate-and-broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            englishText,
            category: categoryRef.current,
          }),
        });

        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }

        if (data.subtitle) {
          setRecentSubtitles((prev) => [...prev.filter((s) => s.id !== data.subtitle.id), data.subtitle]);
        }
      } catch (err: any) {
        console.error('Translation broadcast error:', err);
        setErrorMessage(err.message || 'Failed to translate and broadcast speech.');
      }
    }

    isProcessingQueueRef.current = false;
    setIsProcessing(false);
  };

  // Broadcast spoken phrase or typed phrase to all students via Gemini
  const handleBroadcastPhrase = (englishText: string) => {
    if (!englishText || !englishText.trim()) return;
    const trimmed = englishText.trim();

    // Prevent immediate duplicate firing from speech recognizer within 2.5 seconds
    const now = Date.now();
    if (lastSpokenPhraseRef.current.text === trimmed && (now - lastSpokenPhraseRef.current.time) < 2500) {
      return;
    }
    lastSpokenPhraseRef.current = { text: trimmed, time: now };

    phraseQueueRef.current.push(trimmed);
    processPhraseQueue();
  };

  // Initialize Speech Recognizer once
  useEffect(() => {
    const recognizer = new TeacherSpeechRecognizer({
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          setInterimSpeech('');
          handleBroadcastPhrase(text);
        } else {
          setInterimSpeech(text);
        }
      },
      onError: (err) => {
        setErrorMessage(err);
        if (err.includes('denied') || err.includes('not-allowed')) {
          setMicStatus('denied');
        } else {
          setMicStatus('error');
        }
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
      onStateChange: (listening) => {
        setMicStatus(listening ? 'listening' : 'idle');
      },
    });

    recognizerRef.current = recognizer;

    return () => {
      recognizer.stop();
    };
  }, []);

  // Connect WebSocket as Teacher with auto-ping and auto-reconnect
  useEffect(() => {
    let reconnectTimeout: any = null;
    let pingInterval: any = null;
    let isCancelled = false;

    const connectTeacherWs = () => {
      if (isCancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const cleanSessionId = (sessionId || 'AOL-108').trim().toUpperCase();
      const wsUrl = `${protocol}//${window.location.host}/ws?role=teacher&sessionId=${encodeURIComponent(cleanSessionId)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) return;
        console.log('Teacher WS connected to room:', cleanSessionId);
        // If session was set live in component state, ensure server knows
        if (isLive) {
          ws.send(JSON.stringify({ type: 'SET_LIVE', isLive: true }));
        }
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INIT_TEACHER') {
            setIsLive(!!data.isLive);
            setIsMuted(!!data.isMuted);
            if (Array.isArray(data.students)) setStudentList(data.students);
            if (Array.isArray(data.subtitles)) setRecentSubtitles(data.subtitles);
          } else if (data.type === 'STUDENTS_UPDATED') {
            if (Array.isArray(data.students)) setStudentList(data.students);
          } else if (data.type === 'TRANSLATION_CONFIRMED') {
            if (data.subtitle) {
              setRecentSubtitles((prev) => [...prev.filter((s) => s.id !== data.subtitle.id), data.subtitle]);
            }
          } else if (data.type === 'TTS_WARNING') {
            setErrorMessage(`Audio Notice: ${data.message || 'Hindi TTS audio generation warning'}`);
          }
        } catch (err) {
          console.error('Error parsing teacher WS message:', err);
        }
      };

      ws.onclose = () => {
        if (isCancelled) return;
        reconnectTimeout = setTimeout(connectTeacherWs, 2500);
      };

      ws.onerror = (e) => {
        console.warn('Teacher WS error:', e);
      };
    };

    connectTeacherWs();

    pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'PING' }));
      }
    }, 20000);

    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pingInterval) clearInterval(pingInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId]);

  // Load session metadata & QR Code using public origin
  useEffect(() => {
    const loadSession = async () => {
      try {
        const cleanSessionId = (sessionId || 'AOL-108').trim().toUpperCase();
        const res = await fetch(`/api/sessions/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customId: cleanSessionId,
            category,
            origin: window.location.origin,
          }),
        });
        const data = await res.json();
        if (data.joinUrl) setJoinUrl(data.joinUrl);
        if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
        if (data.title) setSessionTitle(data.title);
      } catch (err) {
        console.error('Failed to load session:', err);
      }
    };
    loadSession();
  }, [sessionId, category]);

  // Toggle Live Session
  const handleToggleLive = async () => {
    const nextLive = !isLive;
    setIsLive(nextLive);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_LIVE', isLive: nextLive }));
    }

    if (nextLive) {
      // Start microphone listening
      if (recognizerRef.current) {
        const ok = await recognizerRef.current.start();
        if (!ok) {
          setMicStatus('denied');
        }
      }
    } else {
      // Stop microphone
      if (recognizerRef.current) {
        recognizerRef.current.stop();
      }
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_MUTED', isMuted: nextMuted }));
    }

    if (recognizerRef.current) {
      if (nextMuted) {
        recognizerRef.current.stop();
      } else if (isLive) {
        recognizerRef.current.start();
      }
    }
  };

  const copySessionLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const selectedCategoryObj = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];

  return (
    <div className="flex-1 overflow-y-auto bg-stone-950 p-4 sm:p-6 lg:p-8 text-stone-100">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-200">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-red-300">Microphone or Translation Notice</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-stone-400 hover:text-stone-200 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-wider">
                  Teacher Control Console
                </span>
                <span className="text-xs font-mono text-stone-400 bg-stone-800 px-2 py-0.5 rounded">
                  Room: {sessionId}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-amber-100 tracking-tight">
                {sessionTitle}
              </h1>
              <p className="text-xs sm:text-sm text-stone-400 max-w-xl">
                Speak in English into your microphone. Gemini Live translation automatically broadcasts fluent Hindi audio and large Devanagari subtitles to all student earphones.
              </p>
            </div>

            {/* Live Master Control Buttons */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {/* Start / Stop Live Session */}
              <button
                onClick={handleToggleLive}
                className={`flex-1 sm:flex-none px-7 py-3.5 rounded-2xl font-bold text-sm transition shadow-lg flex items-center justify-center gap-3 ${
                  isLive
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 ring-2 ring-red-400/50'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 shadow-amber-500/20'
                }`}
              >
                {isLive ? (
                  <>
                    <Square className="w-5 h-5 fill-white" />
                    <span>Stop Session (रोकें)</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-5 h-5 animate-pulse text-stone-950" />
                    <span>Start Session (लाइव शुरू करें)</span>
                  </>
                )}
              </button>

              {/* Mute Button */}
              {isLive && (
                <button
                  onClick={handleToggleMute}
                  className={`p-3.5 rounded-2xl border transition flex items-center justify-center ${
                    isMuted
                      ? 'bg-red-500/20 border-red-500/40 text-red-300'
                      : 'bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-emerald-400" />}
                </button>
              )}

              {/* Simulator launcher */}
              <button
                onClick={onOpenSimulator}
                className="px-4 py-3.5 rounded-2xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 font-semibold text-xs transition flex items-center gap-2"
                title="Open 4-student preview simulator"
              >
                <Layers className="w-4 h-4" />
                <span>4-Student Lab Test</span>
              </button>
            </div>
          </div>

          {/* Microphone & VU Meter Bar */}
          <div className="mt-6 pt-5 border-t border-stone-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-center transition ${
                  isLive && !isMuted
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                    : isMuted
                    ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : 'bg-stone-800 border-stone-700 text-stone-400'
                }`}
              >
                {isLive && !isMuted ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-xs font-semibold text-stone-200 flex items-center gap-2">
                  <span>Microphone Status:</span>
                  <span
                    className={`font-bold ${
                      isLive && !isMuted
                        ? 'text-emerald-400'
                        : isMuted
                        ? 'text-red-400'
                        : 'text-stone-400'
                    }`}
                  >
                    {isLive ? (isMuted ? 'Muted (रोक दिया)' : 'Listening & Broadcasting') : 'Inactive (Click Start Session)'}
                  </span>
                </div>
                <p className="text-[11px] text-stone-400">
                  {micStatus === 'denied'
                    ? 'Microphone blocked in browser permissions'
                    : 'Web Speech API + Web Audio active with noise suppression'}
                </p>
              </div>
            </div>

            {/* Live Audio Level Meter */}
            <div className="flex items-center gap-3 w-full sm:w-64">
              <span className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">VU Meter</span>
              <div className="flex-1 h-2.5 bg-stone-800 rounded-full overflow-hidden p-0.5 border border-stone-700">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    audioLevel > 60
                      ? 'bg-red-500'
                      : audioLevel > 25
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(isLive && !isMuted ? audioLevel : 0, 4))}%` }}
                />
              </div>
              <span className="text-xs font-mono text-stone-400 w-8 text-right">
                {isLive && !isMuted ? `${audioLevel}%` : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Left: QR & Students | Right: Translation Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: QR Code & Student Phones (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Student Joining QR Card */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-5 shadow-lg">
              <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-amber-400" />
                  <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider">
                    Student Join QR Code
                  </h2>
                </div>
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-medium">
                  {studentList.length} Connected
                </span>
              </div>

              {/* QR Image Box */}
              <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-amber-100 text-stone-950 shadow-inner">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Scan to join Hindi translation"
                    className="w-48 h-48 rounded-xl object-contain shadow-md"
                  />
                ) : (
                  <div className="w-48 h-48 bg-stone-200 animate-pulse rounded-xl flex items-center justify-center text-xs text-stone-600">
                    Generating QR Code...
                  </div>
                )}
                <p className="mt-2 text-xs font-bold text-stone-800 text-center">
                  Have students scan with Android Camera or Chrome
                </p>
              </div>

              {/* Link copy & Direct Open */}
              <div className="space-y-2">
                <label className="text-xs text-stone-400">Classroom Join Link:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={joinUrl}
                    className="flex-1 bg-stone-800/90 border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={copySessionLink}
                    className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition flex items-center justify-center shrink-0"
                    title="Copy Link"
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition shrink-0"
                    title="Open Student View in New Tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Active Students List (Target: 4 Students) */}
              <div className="pt-3 border-t border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Classroom Student Phones ({studentList.length}/4 Recommended)</span>
                  </h3>
                </div>

                {studentList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-stone-800/40 border border-dashed border-stone-700/80 text-center space-y-2">
                    <p className="text-xs text-stone-400">
                      No student phones connected yet.
                    </p>
                    <p className="text-[11px] text-amber-400/90">
                      Scan the QR code above on up to 4 phones with earphones.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {studentList.map((student, idx) => (
                      <div
                        key={student.id}
                        className="px-3.5 py-2.5 rounded-xl bg-stone-800/60 border border-stone-700 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="font-semibold text-stone-200">
                            {student.name || `Student ${idx + 1}`}
                          </span>
                        </div>
                        <span className="text-[10px] text-amber-300/80 font-mono bg-stone-900 px-2 py-0.5 rounded border border-stone-800">
                          Earphones Active
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Spiritual Context Selector */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-4 shadow-lg">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-stone-200 uppercase tracking-wider">
                  Art of Living Spiritual Context
                </h3>
              </div>
              <p className="text-xs text-stone-400">
                Aligns Gemini translation prompts with revered terminology and proper Devanagari grammar.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`p-3 rounded-2xl text-left border transition ${
                      category === cat.id
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-200 shadow-md shadow-amber-500/5'
                        : 'bg-stone-800/40 border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    <div className="text-xs font-bold">{cat.name}</div>
                    <div className="text-[11px] font-hindi text-amber-400/80 mt-0.5">{cat.hindiName}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Translation Feed & Speech Presets (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Live Subtitle Monitor (What Students Hear and See) */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-5 shadow-lg flex flex-col h-[520px]">
              <div className="flex items-center justify-between pb-3 border-b border-stone-800 shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider">
                    Live Broadcast Feed (Student View)
                  </h2>
                </div>
                {isProcessing && (
                  <span className="text-xs text-amber-400 flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Gemini Translating & Vocalizing...</span>
                  </span>
                )}
              </div>

              {/* Real-time speech interim bubble */}
              {interimSpeech && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs shrink-0 animate-pulse">
                  <span className="font-semibold text-amber-300">Hearing speech: </span>
                  <span className="italic">"{interimSpeech}"</span>
                </div>
              )}

              {/* Feed scroll area */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
                {recentSubtitles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-500 space-y-3">
                    <Volume2 className="w-10 h-10 text-stone-600" />
                    <div>
                      <p className="text-sm font-medium text-stone-400">Classroom broadcast is quiet</p>
                      <p className="text-xs mt-1">
                        Click "Start Session" and speak English into your mic, or click any preset phrase below to broadcast.
                      </p>
                    </div>
                  </div>
                ) : (
                  recentSubtitles.map((sub, i) => (
                    <div
                      key={sub.id}
                      className={`p-4 rounded-2xl border transition ${
                        i === recentSubtitles.length - 1
                          ? 'bg-gradient-to-r from-stone-800/90 to-amber-950/20 border-amber-500/50 shadow-md'
                          : 'bg-stone-800/40 border-stone-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1.5">
                        <span className="font-semibold text-amber-400">Hindi Audio Stream</span>
                        <span>{new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <p className="font-hindi text-xl sm:text-2xl text-amber-100 font-bold leading-relaxed">
                        {sub.hindi}
                      </p>
                      <p className="text-xs text-stone-400 mt-2 italic border-t border-stone-700/40 pt-2 flex items-start gap-1">
                        <span className="text-stone-500 not-italic font-semibold">Teacher:</span>
                        <span>"{sub.english}"</span>
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Manual speech phrase sender */}
              <div className="pt-3 border-t border-stone-800 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleBroadcastPhrase(manualText);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="Type speech phrase to translate & broadcast to students..."
                    className="flex-1 bg-stone-800/90 border border-stone-700 rounded-xl px-4 py-2.5 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !manualText.trim()}
                    className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold text-xs transition flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Broadcast</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Quick-Speak Classroom Presets */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Quick-Speak Classroom Presets ({selectedCategoryObj.name})
                </h3>
                <span className="text-[11px] text-stone-500">Tap to instantly speak & test</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedCategoryObj.samplePhrases.map((phrase, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleBroadcastPhrase(phrase)}
                    disabled={isProcessing}
                    className="p-3 rounded-xl bg-stone-800/50 hover:bg-stone-800 border border-stone-700/60 hover:border-amber-500/40 text-left text-xs text-stone-300 hover:text-white transition group flex items-start gap-2"
                  >
                    <span className="text-amber-400 font-bold group-hover:scale-110 transition">›</span>
                    <span className="leading-relaxed line-clamp-2">{phrase}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
