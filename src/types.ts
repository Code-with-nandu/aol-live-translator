export type AppRole = 'teacher' | 'student' | 'simulator';

export interface SubtitleItem {
  id: string;
  english: string;
  hindi: string;
  timestamp: number;
}

export interface StudentInfo {
  id: string;
  name: string;
  joinedAt: number;
  battery?: number;
  volume?: number;
}

export interface SessionInfo {
  id: string;
  title: string;
  category: string;
  isLive: boolean;
  isMuted: boolean;
  studentCount: number;
  students: StudentInfo[];
  joinUrl: string;
  qrDataUrl: string;
  subtitles: SubtitleItem[];
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SpiritualCategory {
  id: string;
  name: string;
  hindiName: string;
  description: string;
  samplePhrases: string[];
}
