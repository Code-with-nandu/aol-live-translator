import React, { useState } from 'react';
import { StudentView } from './StudentView';
import { Smartphone, Mic, Radio, Send, Sparkles, Volume2, ArrowLeft } from 'lucide-react';

interface Props {
  sessionId: string;
  onBackToTeacher: () => void;
  onOpenGuide: () => void;
}

export const MultiStudentSim: React.FC<Props> = ({ sessionId, onBackToTeacher, onOpenGuide }) => {
  const [testSpeech, setTestSpeech] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleQuickBroadcast = async (text: string) => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    try {
      await fetch('/api/translate-and-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          englishText: text.trim(),
        }),
      });
      setTestSpeech('');
    } catch (err) {
      console.error('Quick broadcast error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const samplePhrases = [
    'Take a deep breath in and gently close your eyes.',
    'Breathe out slowly and relax your shoulders.',
    'Notice the peace and silence deep within.',
    'Now prepare for Sudarshan Kriya. Breathe in rhythm.',
  ];

  return (
    <div className="flex-1 flex flex-col bg-stone-950 text-stone-100 overflow-hidden">
      {/* Top Test Control Bar */}
      <div className="p-4 bg-stone-900 border-b border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToTeacher}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Teacher Console</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-amber-100">4-Student Phone Simulator Lab</h2>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-2 py-0.5 rounded border border-amber-500/30">
                Session: {sessionId}
              </span>
            </div>
            <p className="text-[11px] text-stone-400">
              Simulating 4 distinct Android phones and student earphones receiving the synchronized Gemini translation broadcast.
            </p>
          </div>
        </div>

        {/* Quick Speech Broadcast Input */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            value={testSpeech}
            onChange={(e) => setTestSpeech(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleQuickBroadcast(testSpeech);
            }}
            placeholder="Type teacher speech to test all 4 phones..."
            className="w-full md:w-72 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={() => handleQuickBroadcast(testSpeech)}
            disabled={isSending || !testSpeech.trim()}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold text-xs transition flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast</span>
          </button>
        </div>
      </div>

      {/* Preset Phrase Pills */}
      <div className="px-4 py-2 bg-stone-900/60 border-b border-stone-800 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 shrink-0">
          Quick Test Phrases:
        </span>
        {samplePhrases.map((phrase, i) => (
          <button
            key={i}
            onClick={() => handleQuickBroadcast(phrase)}
            disabled={isSending}
            className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 hover:text-white transition whitespace-nowrap text-xs"
          >
            "{phrase}"
          </button>
        ))}
      </div>

      {/* 4 Android Phone Frames in a responsive grid */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((studentNum) => (
          <div
            key={studentNum}
            className="flex flex-col bg-stone-900 rounded-3xl border-2 border-stone-800 shadow-2xl overflow-hidden h-[540px] relative"
          >
            {/* Phone Header Decorator */}
            <div className="px-4 py-2 bg-stone-950 border-b border-stone-800 flex items-center justify-between text-[11px] text-stone-400">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Student Phone #{studentNum}
              </span>
              <span className="text-[10px] text-stone-500 font-mono">Earphones In</span>
            </div>

            {/* Embedded Student View for this phone */}
            <div className="flex-1 overflow-hidden">
              <StudentView
                sessionId={sessionId}
                onOpenGuide={onOpenGuide}
                isSimulated={true}
                studentIndex={studentNum}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
