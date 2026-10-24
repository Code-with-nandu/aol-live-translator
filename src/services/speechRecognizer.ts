/**
 * Teacher microphone input and continuous speech recognition service.
 * Supports Web Speech API with audio VU meter via Web Audio API.
 */

export interface SpeechRecognizerCallbacks {
  onTranscript: (finalText: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  onAudioLevel?: (level: number) => void;
  onStateChange?: (isListening: boolean) => void;
}

export class TeacherSpeechRecognizer {
  private recognition: any = null;
  private isListening: boolean = false;
  private shouldRestart: boolean = false;
  private callbacks: SpeechRecognizerCallbacks;
  private audioStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  constructor(callbacks: SpeechRecognizerCallbacks) {
    this.callbacks = callbacks;
    this.initRecognition();
  }

  private initRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.callbacks.onError('Web Speech API is not supported in this browser. You can still use preset phrases or type.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US'; // Teacher speaks English

      this.recognition.onstart = () => {
        this.isListening = true;
        this.callbacks.onStateChange?.(true);
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript.trim()) {
          this.callbacks.onTranscript(finalTranscript.trim(), true);
        } else if (interimTranscript.trim()) {
          this.callbacks.onTranscript(interimTranscript.trim(), false);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Expected during pauses in meditation
          return;
        }
        if (event.error === 'not-allowed') {
          this.callbacks.onError('Microphone permission was denied. Please allow microphone access in your browser settings.');
          this.stop();
          return;
        }
        this.callbacks.onError(`Speech recognition error: ${event.error}`);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.callbacks.onStateChange?.(false);
        // If user intended to stay listening, automatically restart
        if (this.shouldRestart) {
          try {
            this.recognition.start();
          } catch (e) {
            // Already started or busy
          }
        }
      };
    } catch (err: any) {
      console.warn('SpeechRecognition initialization error:', err);
    }
  }

  public async start(): Promise<boolean> {
    this.shouldRestart = true;

    // 1. Request microphone access for live VU meter
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.startAudioMeter(this.audioStream);
    } catch (err: any) {
      console.warn('Microphone permission error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.callbacks.onError('Microphone access denied. Please allow microphone permission in browser settings.');
        return false;
      }
    }

    // 2. Start speech recognition
    if (this.recognition) {
      try {
        this.recognition.start();
        return true;
      } catch (err: any) {
        if (err.name !== 'InvalidStateError') {
          console.warn('Recognition start error:', err);
        }
        return true;
      }
    }

    return false;
  }

  private startAudioMeter(stream: MediaStream) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!this.analyser || !this.isListening) {
          this.callbacks.onAudioLevel?.(0);
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        // Normalize 0 to 100
        const level = Math.min(100, Math.round((average / 128) * 100));
        this.callbacks.onAudioLevel?.(level);

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Audio meter init error:', e);
    }
  }

  public stop() {
    this.shouldRestart = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }

    this.isListening = false;
    this.callbacks.onAudioLevel?.(0);
    this.callbacks.onStateChange?.(false);
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}
