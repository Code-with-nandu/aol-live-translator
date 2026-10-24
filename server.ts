import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import QRCode from 'qrcode';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface SubtitleItem {
  id: string;
  english: string;
  hindi: string;
  timestamp: number;
}

interface StudentClientInfo {
  id: string;
  name: string;
  ws: WebSocket;
  joinedAt: number;
  lastPing: number;
}

interface SessionData {
  id: string;
  title: string;
  category: string;
  createdAt: number;
  isLive: boolean;
  isMuted: boolean;
  teacherWs: WebSocket | null;
  students: Map<string, StudentClientInfo>;
  subtitles: SubtitleItem[];
}

const sessions = new Map<string, SessionData>();

// Context prompts for Art of Living translations
const CONTEXT_GUIDES: Record<string, string> = {
  general: 'General Art of Living classroom wisdom, meditation, and life knowledge.',
  satsang_kriya: 'Pranayama breathwork, Sudarshan Kriya instructions, rhythm of breath, Ujjayi, Bhastrika, and Satsang.',
  meditation: 'Guided meditation, Sahaj Samadhi, deep rest, inner silence, closing eyes, letting go, witness consciousness.',
  wisdom: 'Wisdom talks, knowledge sheets, managing the mind, emotions, Ashtavakra Gita, Patanjali Yoga Sutras.',
};

function getSystemInstruction(category: string): string {
  const contextDesc = CONTEXT_GUIDES[category] || CONTEXT_GUIDES.general;
  return `You are a dedicated real-time English-to-Hindi speech translator for an Art of Living physical classroom session.
Physical setting: An English-speaking teacher is teaching four students who understand only Hindi and are listening via mobile earphones.
Session Focus: ${contextDesc}

Translation Guidelines:
1. Translate English speech into natural, reverent, conversational, and serene Hindi in clear Devanagari script.
2. Accurately translate spiritual and yogic terms:
   - "Deep breath in" -> "एक गहरी श्वास अंदर लें"
   - "Breathe out gently" -> "धीरे से श्वास बाहर छोड़ें"
   - "Sudarshan Kriya" -> "सुदर्शन क्रिया"
   - "Pranayama" -> "प्राणायाम"
   - "Ujjayi breath" -> "उज्जायी श्वास"
   - "Close your eyes" -> "अपनी आँखें बंद करें"
   - "Relax your whole body" -> "अपने पूरे शरीर को विश्राम दें"
   - "Sadhana, Seva, Satsang" -> "साधना, सेवा, सत्संग"
   - "Gurudev / Sri Sri" -> "गुरुदेव"
   - "Let go" -> "सब कुछ छोड़ दें / विश्राम में रहें"
3. Keep the translation concise, warm, and synchronous so students hear it in rhythm with the teacher's pace.
4. Output STRICTLY the Hindi translation text only. No preamble, no quotes, no English notes.`;
}

// Generate Hindi TTS audio buffer using Gemini TTS
async function generateHindiAudio(text: string): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  try {
    const ttsRes = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.trim(),
              speechMetadata: {
                style: 'Calm, gentle, meditative, warm spiritual guide speaking fluent Hindi',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioBase64 = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return audioBase64 || null;
  } catch (err: any) {
    console.error('Gemini TTS error:', err?.message || err);
    return null;
  }
}

// Translate English text to Hindi with Gemini
async function translateEnglishToHindi(englishText: string, category: string = 'general'): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = `Translate this teacher's speech segment to Hindi:\n"${englishText.trim()}"`;

  const res = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      systemInstruction: getSystemInstruction(category),
      temperature: 0.2,
    },
  });

  return (res.text || '').trim();
}

// Pre-create a default room if not existing
function getOrCreateSession(sessionId: string, title?: string, category?: string): SessionData {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      title: title || `Art of Living Classroom (${sessionId})`,
      category: category || 'satsang_kriya',
      createdAt: Date.now(),
      isLive: false,
      isMuted: false,
      teacherWs: null,
      students: new Map(),
      subtitles: [],
    };
    sessions.set(sessionId, session);
  } else {
    if (title) session.title = title;
    if (category) session.category = category;
  }
  return session;
}

// Broadcast to all students in a session
function broadcastToStudents(session: SessionData, payload: any) {
  const jsonStr = JSON.stringify(payload);
  session.students.forEach((student, studentId) => {
    if (student.ws.readyState === WebSocket.OPEN) {
      try {
        student.ws.send(jsonStr);
      } catch (err) {
        console.error(`Failed to send to student ${studentId}:`, err);
      }
    }
  });
}

// Broadcast student count update to teacher
function notifyTeacher(session: SessionData, payload: any) {
  if (session.teacherWs && session.teacherWs.readyState === WebSocket.OPEN) {
    try {
      session.teacherWs.send(JSON.stringify(payload));
    } catch (err) {
      console.error('Failed to notify teacher:', err);
    }
  }
}

function getStudentList(session: SessionData) {
  const list: Array<{ id: string; name: string; joinedAt: number }> = [];
  session.students.forEach((s) => {
    list.push({ id: s.id, name: s.name, joinedAt: s.joinedAt });
  });
  return list;
}

// API Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    timestamp: Date.now(),
    activeSessions: sessions.size,
  });
});

// Create or get session
app.post('/api/sessions/create', async (req: Request, res: Response) => {
  try {
    const { customId, title, category } = req.body;
    const sessionId = customId?.trim() || `AOL-${Math.floor(1000 + Math.random() * 9000)}`;
    const session = getOrCreateSession(sessionId, title, category);

    // Determine host URL for QR code
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const joinUrl = `${protocol}://${host}/?session=${encodeURIComponent(sessionId)}`;

    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#1c1917',
        light: '#fef3c7',
      },
    });

    res.json({
      success: true,
      sessionId: session.id,
      title: session.title,
      category: session.category,
      joinUrl,
      qrDataUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create session' });
  }
});

// Get session details
app.get('/api/sessions/:id', async (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const joinUrl = `${protocol}://${host}/?session=${encodeURIComponent(sessionId)}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    width: 300,
    margin: 2,
    color: {
      dark: '#1c1917',
      light: '#fef3c7',
    },
  });

  res.json({
    id: session.id,
    title: session.title,
    category: session.category,
    isLive: session.isLive,
    isMuted: session.isMuted,
    studentCount: session.students.size,
    students: getStudentList(session),
    joinUrl,
    qrDataUrl,
    subtitles: session.subtitles.slice(-10),
  });
});

// Translate and broadcast API (used when teacher speaks or submits a phrase)
app.post('/api/translate-and-broadcast', async (req: Request, res: Response) => {
  try {
    const { sessionId, englishText, category } = req.body;
    if (!englishText || !englishText.trim()) {
      return res.status(400).json({ error: 'englishText is required' });
    }

    const session = getOrCreateSession(sessionId || 'AOL-DEFAULT');
    const chosenCategory = category || session.category || 'general';

    // 1. Translate with Gemini
    const hindiTranslation = await translateEnglishToHindi(englishText, chosenCategory);

    // 2. Synthesize audio with Gemini TTS
    const audioBase64 = await generateHindiAudio(hindiTranslation);

    const subtitleItem: SubtitleItem = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      english: englishText.trim(),
      hindi: hindiTranslation,
      timestamp: Date.now(),
    };

    // Store in transient session memory (max 50 recent subtitles)
    session.subtitles.push(subtitleItem);
    if (session.subtitles.length > 50) {
      session.subtitles.shift();
    }

    // 3. Broadcast to all student phones in near real-time
    broadcastToStudents(session, {
      type: 'TRANSLATION_BROADCAST',
      subtitle: subtitleItem,
      audioBase64, // Complete 24kHz WAV audio from Gemini TTS
      isLive: session.isLive,
    });

    // 4. Return to teacher
    res.json({
      success: true,
      subtitle: subtitleItem,
      audioAvailable: !!audioBase64,
      studentCount: session.students.size,
    });
  } catch (err: any) {
    console.error('Translation failed:', err);
    res.status(500).json({
      error: err.message || 'Translation error',
      details: 'Please check that GEMINI_API_KEY is properly attached.',
    });
  }
});

// Sample test audio for student earphone testing
app.get('/api/test-audio', async (req: Request, res: Response) => {
  try {
    const testHindi = 'नमस्ते! यह आर्ट ऑफ लिविंग लाइव ट्रांसलेटर है। आपकी ध्वनि सही तरीके से चल रही है।';
    const audioBase64 = await generateHindiAudio(testHindi);
    res.json({
      success: true,
      text: testHindi,
      audioBase64,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket Server for Real-Time Streaming and Broadcast
wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const role = url.searchParams.get('role') || 'student';
  const sessionId = url.searchParams.get('sessionId') || 'AOL-DEFAULT';
  const studentId = url.searchParams.get('studentId') || `student-${Math.random().toString(36).substring(2, 8)}`;
  const studentName = url.searchParams.get('studentName') || `Student (${studentId.substring(8, 12).toUpperCase()})`;

  const session = getOrCreateSession(sessionId);

  if (role === 'teacher') {
    session.teacherWs = ws;
    // Notify all students that teacher is present
    broadcastToStudents(session, {
      type: 'TEACHER_STATUS',
      teacherConnected: true,
      isLive: session.isLive,
      isMuted: session.isMuted,
    });
    // Send initial session stats to teacher
    ws.send(
      JSON.stringify({
        type: 'INIT_TEACHER',
        sessionId: session.id,
        isLive: session.isLive,
        isMuted: session.isMuted,
        studentCount: session.students.size,
        students: getStudentList(session),
        subtitles: session.subtitles.slice(-10),
      })
    );
  } else {
    // Register student
    const studentInfo: StudentClientInfo = {
      id: studentId,
      name: studentName,
      ws,
      joinedAt: Date.now(),
      lastPing: Date.now(),
    };
    session.students.set(studentId, studentInfo);

    // Send state to student
    ws.send(
      JSON.stringify({
        type: 'INIT_STUDENT',
        sessionId: session.id,
        title: session.title,
        category: session.category,
        isLive: session.isLive,
        isMuted: session.isMuted,
        teacherConnected: !!session.teacherWs && session.teacherWs.readyState === WebSocket.OPEN,
        studentCount: session.students.size,
        recentSubtitles: session.subtitles.slice(-8),
      })
    );

    // Notify teacher of updated student list
    notifyTeacher(session, {
      type: 'STUDENTS_UPDATED',
      studentCount: session.students.size,
      students: getStudentList(session),
    });

    // Notify other students of count
    broadcastToStudents(session, {
      type: 'STUDENT_COUNT_CHANGE',
      studentCount: session.students.size,
    });
  }

  // Handle messages
  ws.on('message', async (messageData) => {
    try {
      const data = JSON.parse(messageData.toString());

      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        return;
      }

      if (role === 'teacher') {
        if (data.type === 'SET_LIVE') {
          session.isLive = !!data.isLive;
          broadcastToStudents(session, {
            type: 'SESSION_LIVE_STATE',
            isLive: session.isLive,
          });
          notifyTeacher(session, {
            type: 'SESSION_LIVE_STATE',
            isLive: session.isLive,
          });
        } else if (data.type === 'SET_MUTED') {
          session.isMuted = !!data.isMuted;
          broadcastToStudents(session, {
            type: 'TEACHER_MUTED_STATE',
            isMuted: session.isMuted,
          });
        } else if (data.type === 'TRANSLATE_PHRASE') {
          // Real-time speech transcript from teacher's phone/laptop
          const text = data.text?.trim();
          if (text) {
            try {
              const hindiText = await translateEnglishToHindi(text, session.category);
              const audioBase64 = await generateHindiAudio(hindiText);

              const sub: SubtitleItem = {
                id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                english: text,
                hindi: hindiText,
                timestamp: Date.now(),
              };

              session.subtitles.push(sub);
              if (session.subtitles.length > 50) session.subtitles.shift();

              // Broadcast to all students
              broadcastToStudents(session, {
                type: 'TRANSLATION_BROADCAST',
                subtitle: sub,
                audioBase64,
                isLive: session.isLive,
              });

              // Confirm back to teacher
              ws.send(
                JSON.stringify({
                  type: 'TRANSLATION_CONFIRMED',
                  subtitle: sub,
                })
              );
            } catch (err: any) {
              ws.send(
                JSON.stringify({
                  type: 'TRANSLATION_ERROR',
                  error: err?.message || 'Failed to translate',
                })
              );
            }
          }
        }
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    if (role === 'teacher') {
      if (session.teacherWs === ws) {
        session.teacherWs = null;
        broadcastToStudents(session, {
          type: 'TEACHER_STATUS',
          teacherConnected: false,
          isLive: session.isLive,
        });
      }
    } else {
      session.students.delete(studentId);
      notifyTeacher(session, {
        type: 'STUDENTS_UPDATED',
        studentCount: session.students.size,
        students: getStudentList(session),
      });
      broadcastToStudents(session, {
        type: 'STUDENT_COUNT_CHANGE',
        studentCount: session.students.size,
      });
    }
  });
});

// Vite or Static file serving
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`[AOL Translator] Server running on port ${PORT} (dev: ${!isProduction})`);
  });
}

startServer();
