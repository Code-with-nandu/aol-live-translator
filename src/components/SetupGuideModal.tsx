import React from 'react';
import { X, Smartphone, Mic, Headphones, ShieldCheck, DollarSign, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SetupGuideModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl text-stone-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-stone-800">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-amber-100">Classroom Setup & Testing Guide</h2>
            <p className="text-xs text-stone-400">1 Teacher Laptop/Phone + 4 Android Student Phones with Earphones</p>
          </div>
        </div>

        {/* 4 Step Testing Walkthrough */}
        <div className="mt-5 space-y-4">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
            Quick 4-Step Testing Procedure
          </h3>

          <div className="grid gap-3">
            <div className="p-4 rounded-xl bg-stone-800/60 border border-stone-700/60 flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold text-xs shrink-0 mt-0.5">
                1
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-amber-400" />
                  Teacher Screen Setup
                </h4>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Open the Teacher screen on your laptop or phone. Allow browser microphone access when prompted. You will see a live audio VU meter reacting to your voice. Select your session context (e.g., "Pranayama & Sudarshan Kriya" or "Guided Meditation").
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-stone-800/60 border border-stone-700/60 flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold text-xs shrink-0 mt-0.5">
                2
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  Connect 4 Student Phones
                </h4>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Have each of the four Hindi-speaking students scan the large on-screen QR Code using their Android phone camera (or Google Lens / Chrome). The student link automatically binds to this room. Plug in their earphones.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-stone-800/60 border border-stone-700/60 flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold text-xs shrink-0 mt-0.5">
                3
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-amber-400" />
                  Students Tap "Join Audio" & Test Earphones
                </h4>
                <p className="text-xs text-stone-300 leading-relaxed">
                  On Android Chrome, Web Audio autoplay requires one initial tap. Each student taps <span className="text-amber-300 font-medium">"ध्वनि सक्षम करें (Enable Audio)"</span> and can press <span className="text-amber-300 font-medium">"Test Earphone Audio"</span> to hear a calming Hindi greeting. Each student can independently adjust their volume slider.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-stone-800/60 border border-stone-700/60 flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold text-xs shrink-0 mt-0.5">
                4
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-amber-400" />
                  Start Live English Speech & Broadcast
                </h4>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Teacher clicks <span className="text-emerald-400 font-medium">"Start Session (लाइव शुरू करें)"</span> and speaks naturally in English. Gemini instantly translates into fluent Hindi and generates clear Hindi audio. The single translated stream is fanned out in sync to all 4 student phones!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Lab Simulator Tip */}
        <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="text-xs text-stone-200">
              <span className="font-semibold text-amber-300">Testing on 1 computer?</span> Use the <span className="font-semibold text-white">"4-Student Lab Test"</span> mode in the top navigation to simulate 4 Android phones side-by-side simultaneously!
            </div>
          </div>
        </div>

        {/* Security & Reliability */}
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Security & Privacy Architecture
          </h3>
          <ul className="grid gap-2 text-xs text-stone-300">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Zero Client Key Exposure:</strong> The Gemini API key is securely managed exclusively in the backend server (<code className="text-amber-200 bg-stone-800 px-1 py-0.5 rounded">server.ts</code>). Student and teacher browsers never access the secret key.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Ephemeral Memory Streaming:</strong> Classroom audio chunks and transcripts exist strictly in transient memory during the live session. No classroom audio or transcripts are written to persistent disk or databases.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Fan-Out Single-Pipeline Architecture:</strong> The teacher's speech is translated once by Gemini and distributed via WebSocket to all student devices simultaneously, preventing duplicate API requests and keeping student audio synchronized.</span>
            </li>
          </ul>
        </div>

        {/* Model & Cost Transparency */}
        <div className="mt-6 pt-4 border-t border-stone-800 space-y-3">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Supported Gemini Models & Estimated Costs
          </h3>
          <div className="p-3.5 rounded-xl bg-stone-800/60 border border-stone-700/60 text-xs text-stone-300 space-y-2">
            <p>
              • <strong>Translation Engine:</strong> <code className="text-amber-300">gemini-3.8-flash</code> tuned with Art of Living spiritual lexicon (Sudarshan Kriya, Pranayama, Ujjayi, Satsang, Gurudev).
            </p>
            <p>
              • <strong>Hindi Speech Synthesis:</strong> <code className="text-amber-300">gemini-3.8-flash-lite-tts</code> providing natural, soothing 24kHz audio.
            </p>
            <p>
              • <strong>Session Cost:</strong> A typical 1-hour classroom session (approx. 3,000 words spoken) costs less than <strong>$0.05 USD total</strong> because all 4 students receive the single broadcast stream.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm transition shadow-lg shadow-amber-500/20"
          >
            Got it, Let's Begin
          </button>
        </div>
      </div>
    </div>
  );
};
