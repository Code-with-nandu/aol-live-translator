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
app.set('trust proxy', true);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function getBaseUrl(req: Request): string {
  if (req.body?.origin && typeof req.body.origin === 'string' && req.body.origin.startsWith('http')) {
    return req.body.origin.replace(/\/$/, '');
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const forwardedHost = req.headers['x-forwarded-host'] as string;
  const forwardedProto = (req.headers['x-forwarded-proto'] as string) || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
}

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

// Fallback high-availability Hindi TTS endpoint (zero-quota interruption protection)
async function generateFallbackHindiAudio(text: string): Promise<string | null> {
  try {
    const cleanText = text.trim();
    if (!cleanText) return null;
    const truncated = cleanText.length > 200 ? cleanText.substring(0, 195) + '...' : cleanText;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=hi&client=tw-ob&q=${encodeURIComponent(truncated)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) {
      console.warn('Fallback Google TTS response status:', res.status);
      return null;
    }
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0) return null;
    return Buffer.from(arrayBuf).toString('base64');
  } catch (err: any) {
    console.warn('Fallback Google TTS error:', err?.message || err);
    return null;
  }
}

// Generate Hindi TTS audio buffer using Gemini TTS with cascading fallback
async function generateHindiAudio(text: string): Promise<string | null> {
  const cleanText = text.trim();
  if (!cleanText) return null;

  // Candidate models: gemini-3.8-flash-tts is the primary full-featured TTS model, followed by gemini-3.8-flash-lite-tts
  const ttsCandidateModels = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];

  if (process.env.GEMINI_API_KEY) {
    for (const model of ttsCandidateModels) {
      try {
        const ttsRes = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanText,
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
        if (audioBase64) {
          return audioBase64;
        }
      } catch (err: any) {
        console.warn(`Gemini TTS model ${model} error, trying next fallback:`, err?.message || err);
      }
    }
  }

  // Resilient third-tier fallback: high-availability HTTP Hindi TTS stream
  console.log('Attempting high-availability Hindi TTS fallback for:', cleanText);
  const fallbackAudio = await generateFallbackHindiAudio(cleanText);
  if (fallbackAudio) {
    return fallbackAudio;
  }

  return null;
}

// Translate English text to Hindi with Gemini (ultra-fast latency with resilient fallback)
async function translateEnglishToHindi(englishText: string, category: string = 'general'): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = `Translate this teacher's speech segment to Hindi:\n"${englishText.trim()}"`;
  const systemInstruction = getSystemInstruction(category);

  // Supported models to try: gemini-3.1-flash-lite (fastest, zero thinking latency), then gemini-flash-latest, then gemini-3.8-flash
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      const text = (res.text || '').trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      console.warn(`Model ${model} translation error, trying fallback:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('All translation models failed');
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

    // Determine public host URL for QR code and student join link
    const baseUrl = getBaseUrl(req);
    const joinUrl = `${baseUrl}/?session=${encodeURIComponent(sessionId)}`;

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
  const normId = (req.params.id || 'AOL-108').trim().toUpperCase();
  const session = getOrCreateSession(normId);

  const baseUrl = getBaseUrl(req);
  const joinUrl = `${baseUrl}/?session=${encodeURIComponent(session.id)}`;
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

    const normId = (sessionId || 'AOL-108').trim().toUpperCase();
    const session = getOrCreateSession(normId);
    const chosenCategory = category || session.category || 'general';

    // 1. Translate with Gemini (~1s)
    const hindiTranslation = await translateEnglishToHindi(englishText, chosenCategory);

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

    // 2. Broadcast subtitles immediately to all student phones so screens update with zero perceptible delay
    broadcastToStudents(session, {
      type: 'TRANSLATION_BROADCAST',
      subtitle: subtitleItem,
      audioBase64: null,
      isLive: session.isLive,
    });

    // 3. Return to teacher console immediately
    res.json({
      success: true,
      subtitle: subtitleItem,
      studentCount: session.students.size,
    });

    // 4. Asynchronously synthesize Hindi audio and broadcast as soon as ready (with text fallback)
    generateHindiAudio(hindiTranslation)
      .then((audioBase64) => {
        if (audioBase64) {
          broadcastToStudents(session, {
            type: 'AUDIO_CHUNK_BROADCAST',
            subtitleId: subtitleItem.id,
            audioBase64,
            hindiText: hindiTranslation,
            ttsSuccess: true,
          });
        } else {
          console.warn('Hindi TTS audio generation returned null');
          broadcastToStudents(session, {
            type: 'AUDIO_CHUNK_BROADCAST',
            subtitleId: subtitleItem.id,
            audioBase64: null,
            hindiText: hindiTranslation,
            ttsSuccess: false,
            ttsError: 'ध्वनि निर्माण में त्रुटि (Hindi TTS failed on server)',
          });
          notifyTeacher(session, {
            type: 'TTS_WARNING',
            subtitleId: subtitleItem.id,
            message: 'Hindi speech audio could not be generated for this phrase.',
          });
        }
      })
      .catch((err) => {
        console.warn('Async Hindi TTS error:', err?.message || err);
        broadcastToStudents(session, {
          type: 'AUDIO_CHUNK_BROADCAST',
          subtitleId: subtitleItem.id,
          audioBase64: null,
          hindiText: hindiTranslation,
          ttsSuccess: false,
          ttsError: err?.message || 'Hindi TTS error',
        });
        notifyTeacher(session, {
          type: 'TTS_WARNING',
          subtitleId: subtitleItem.id,
          message: err?.message || 'Hindi TTS error',
        });
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
    if (!audioBase64) {
      return res.status(500).json({
        success: false,
        error: 'Failed to synthesize test Hindi audio',
        text: testHindi,
      });
    }
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
  const rawSessionId = url.searchParams.get('sessionId') || 'AOL-108';
  const sessionId = rawSessionId.trim().toUpperCase();
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

              const sub: SubtitleItem = {
                id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                english: text,
                hindi: hindiText,
                timestamp: Date.now(),
              };

              session.subtitles.push(sub);
              if (session.subtitles.length > 50) session.subtitles.shift();

              // Broadcast subtitle immediately to all students
              broadcastToStudents(session, {
                type: 'TRANSLATION_BROADCAST',
                subtitle: sub,
                audioBase64: null,
                isLive: session.isLive,
              });

              // Confirm back to teacher immediately
              ws.send(
                JSON.stringify({
                  type: 'TRANSLATION_CONFIRMED',
                  subtitle: sub,
                })
              );

              // Asynchronously synthesize audio and stream to all students
              generateHindiAudio(hindiText)
                .then((audioBase64) => {
                  if (audioBase64) {
                    broadcastToStudents(session, {
                      type: 'AUDIO_CHUNK_BROADCAST',
                      subtitleId: sub.id,
                      audioBase64,
                      hindiText: hindiText,
                      ttsSuccess: true,
                    });
                  } else {
                    console.warn('Hindi TTS audio generation returned null in WS path');
                    broadcastToStudents(session, {
                      type: 'AUDIO_CHUNK_BROADCAST',
                      subtitleId: sub.id,
                      audioBase64: null,
                      hindiText: hindiText,
                      ttsSuccess: false,
                      ttsError: 'ध्वनि निर्माण में त्रुटि (Hindi TTS failed on server)',
                    });
                    notifyTeacher(session, {
                      type: 'TTS_WARNING',
                      subtitleId: sub.id,
                      message: 'Hindi speech audio could not be generated for this phrase.',
                    });
                  }
                })
                .catch((err) => {
                  console.warn('Async Hindi TTS error in WS:', err?.message || err);
                  broadcastToStudents(session, {
                    type: 'AUDIO_CHUNK_BROADCAST',
                    subtitleId: sub.id,
                    audioBase64: null,
                    hindiText: hindiText,
                    ttsSuccess: false,
                    ttsError: err?.message || 'Hindi TTS error',
                  });
                  notifyTeacher(session, {
                    type: 'TTS_WARNING',
                    subtitleId: sub.id,
                    message: err?.message || 'Hindi TTS error',
                  });
                });
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
      const existingStudent = session.students.get(studentId);
      if (existingStudent && existingStudent.ws === ws) {
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
