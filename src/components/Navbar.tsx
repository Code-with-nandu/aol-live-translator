import React from 'react';
import { AppRole } from '../types';
import { Mic, Smartphone, Layers, HelpCircle, ShieldCheck, Sparkles } from 'lucide-react';

interface Props {
  currentRole: AppRole;
  onChangeRole: (role: AppRole) => void;
  sessionId: string;
  onOpenGuide: () => void;
}

export const Navbar: React.FC<Props> = ({ currentRole, onChangeRole, sessionId, onOpenGuide }) => {
  return (
    <header className="px-4 py-3 bg-stone-900/95 border-b border-stone-800/80 backdrop-blur-md flex items-center justify-between shrink-0 z-30">
      {/* Brand logo & title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-300 flex items-center justify-center text-stone-950 font-black text-lg shadow-md shadow-amber-500/10">
          ॐ
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-extrabold text-stone-100 tracking-tight">
              AOL Live Hindi Translator
            </h1>
            <span className="hidden sm:inline-block text-[10px] font-hindi font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              आर्ट ऑफ लिविंग
            </span>
          </div>
          <p className="text-[11px] text-stone-400 hidden sm:block">
            Real-time English-to-Hindi Speech & Audio for Classroom Phones
          </p>
        </div>
      </div>

      {/* Role Switcher Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-950 rounded-2xl border border-stone-800">
        <button
          onClick={() => onChangeRole('teacher')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            currentRole === 'teacher'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Teacher</span>
        </button>

        <button
          onClick={() => onChangeRole('student')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            currentRole === 'student'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Student Phone</span>
        </button>

        <button
          onClick={() => onChangeRole('simulator')}
          className={`hidden md:flex px-3 py-1.5 rounded-xl text-xs font-bold transition items-center gap-1.5 ${
            currentRole === 'simulator'
              ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
              : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>4-Student Lab Test</span>
        </button>
      </div>

      {/* Right Actions: Session & Guide */}
      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-800 text-stone-300 text-xs font-mono border border-stone-700">
          <span className="text-[10px] text-stone-500 uppercase">Room:</span>
          <span className="text-amber-300 font-bold">{sessionId}</span>
        </div>

        <button
          onClick={onOpenGuide}
          className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 text-xs font-semibold transition flex items-center gap-1.5"
          title="Classroom Setup & Cost Guide"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Setup & Costs</span>
        </button>
      </div>
    </header>
  );
};
