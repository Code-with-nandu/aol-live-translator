/**
 * Audio Player for Hindi speech playback in student earphones.
 * Uses Web Audio API with GainNode for independent student volume control.
 */

export class StudentAudioPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private volume: number = 0.85; // Default 85%
  private isUnlocked: boolean = false;
  private isMuted: boolean = false;
  private queue: Array<{ base64Audio?: string; textFallback?: string }> = [];
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onPlayStateChange?: (playing: boolean) => void;
  private onError?: (error: string) => void;

  constructor(
    onPlayStateChange?: (playing: boolean) => void,
    onError?: (error: string) => void
  ) {
    this.onPlayStateChange = onPlayStateChange;
    this.onError = onError;
  }

  public async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        this.gainNode.connect(this.ctx.destination);
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Play a short silent buffer to prime audio on Android Chrome / iOS
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);

      this.isUnlocked = true;

      // Immediately process any queued audio that arrived before unlock
      if (!this.isPlaying && this.queue.length > 0) {
        this.playNext();
      }

      return true;
    } catch (err) {
      console.warn('AudioContext unlock failed:', err);
      return false;
    }
  }

  public getUnlocked(): boolean {
    return this.isUnlocked && this.ctx?.state === 'running';
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public isCurrentlyMuted(): boolean {
    return this.isMuted;
  }

  public queueAudio(base64Audio?: string, textFallback?: string) {
    if (!this.isUnlocked) {
      // Store latest queued items until user taps to enable audio
      if (this.queue.length >= 4) this.queue.shift();
      this.queue.push({ base64Audio, textFallback });
      return;
    }

    this.queue.push({ base64Audio, textFallback });
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.onPlayStateChange?.(false);
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.isPlaying = true;
    this.onPlayStateChange?.(true);

    let played = false;

    if (item.base64Audio) {
      try {
        await this.playBase64Audio(item.base64Audio);
        played = true;
      } catch (err: any) {
        console.warn('Failed to decode/play base64 audio:', err?.message || err);
      }
    }

    if (!played && item.textFallback) {
      try {
        await this.playSpeechSynthesis(item.textFallback);
        played = true;
      } catch (err) {
        console.warn('SpeechSynthesis fallback error:', err);
      }
    }

    if (!played) {
      this.onError?.('ध्वनि चलाने में असमर्थ (Failed to decode or play audio chunk)');
    }

    // Short calm gap between phrases (150ms)
    setTimeout(() => {
      this.playNext();
    }, 150);
  }

  private async playBase64Audio(base64: string): Promise<void> {
    if (!this.ctx || !this.gainNode) {
      await this.unlock();
    }
    if (!this.ctx || !this.gainNode) {
      throw new Error('AudioContext unavailable');
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        // May require user gesture on mobile
      }
      if (this.ctx.state === 'suspended') {
        this.onError?.('ब्राउज़र ने ऑडियो रोक रखा है। सुनने के लिए स्क्रीन पर टैप करें (Audio suspended by browser - tap anywhere to resume)');
      }
    }

    // Strip any data URI prefix (e.g. data:audio/wav;base64,) and whitespace
    const cleanBase64 = base64.replace(/^data:audio\/[^;]+;base64,/, '').replace(/\s+/g, '');
    const binaryString = atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode audio buffer (handles both WAV and MP3 natively) with timeout protection
    const decodePromise = new Promise<AudioBuffer>((resolve, reject) => {
      const res = this.ctx!.decodeAudioData(
        bytes.buffer.slice(0),
        (buf) => resolve(buf),
        (err) => reject(err)
      );
      if (res && typeof (res as any).then === 'function') {
        (res as any).then(resolve).catch(reject);
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Audio decode timed out')), 5000)
    );

    const audioBuffer = await Promise.race([decodePromise, timeoutPromise]);

    return new Promise((resolve) => {
      if (!this.ctx || !this.gainNode) {
        resolve();
        return;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);
      this.currentSource = source;

      let hasFinished = false;
      const finish = () => {
        if (!hasFinished) {
          hasFinished = true;
          this.currentSource = null;
          resolve();
        }
      };

      source.onended = finish;

      // Safety timeout: in case mobile device suspends onended event
      const maxDurationMs = Math.max(800, audioBuffer.duration * 1000 + 1200);
      setTimeout(finish, maxDurationMs);

      source.start();
    });
  }

  private playSpeechSynthesis(hindiText: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(hindiText);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.92; // Slightly slower, calm pace for spiritual meditation
      utterance.pitch = 1.0;
      utterance.volume = this.isMuted ? 0 : this.volume;

      // Select Hindi voice if available
      const voices = window.speechSynthesis.getVoices();
      const hindiVoice = voices.find((v) => v.lang.includes('hi') || v.lang.includes('Hindi'));
      if (hindiVoice) {
        utterance.voice = hindiVoice;
      }

      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      // Safety timeout: speech synthesis can occasionally hang on mobile Android
      setTimeout(finish, 8000);

      window.speechSynthesis.speak(utterance);
    });
  }

  public stop() {
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {}
      this.currentSource = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isPlaying = false;
    this.onPlayStateChange?.(false);
  }

  public close() {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.ctx = null;
  }
}
