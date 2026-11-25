/**
 * Reading narration aloud. Everything that speaks goes through `Narrator`,
 * so the device's built-in voice can be swapped for a hosted one later by
 * writing another `Voice`, without touching any screen.
 */

/** Something that can speak a piece of text and say when it has finished. */
export interface Voice {
  speak(text: string, options: { rate: number; voice: string | null }, onEnd: () => void): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  /** Names of the voices on offer, for the settings. */
  voices(): string[];
}

export interface SpeechSettings {
  on: boolean;
  /** 0.6 to 1.6. 1 is the voice's usual speed. */
  rate: number;
  voice: string | null;
}

export const DEFAULT_SPEECH: SpeechSettings = { on: true, rate: 1, voice: null };
const KEY = 'waymark.speech';

export function loadSpeech(storage: Pick<Storage, 'getItem'> = localStorage): SpeechSettings {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? '{}') as Partial<SpeechSettings>;
    return {
      on: typeof saved.on === 'boolean' ? saved.on : DEFAULT_SPEECH.on,
      rate: typeof saved.rate === 'number' ? Math.min(1.6, Math.max(0.6, saved.rate)) : 1,
      voice: typeof saved.voice === 'string' ? saved.voice : null,
    };
  } catch {
    return DEFAULT_SPEECH;
  }
}

export function saveSpeech(
  settings: SpeechSettings,
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  storage.setItem(KEY, JSON.stringify(settings));
}

/** Long narration is spoken a sentence at a time, so pausing and stopping feel immediate. */
export const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Speaks narration in the order it arrives. */
export class Narrator {
  private queue: string[] = [];
  private speaking = false;
  private paused = false;
  private last = '';

  constructor(
    private voice: Voice | null,
    public settings: SpeechSettings,
  ) {}

  /** Whether this device can speak at all. */
  get available(): boolean {
    return this.voice !== null;
  }
  get isPaused(): boolean {
    return this.paused;
  }
  get pending(): number {
    return this.queue.length + (this.speaking ? 1 : 0);
  }

  /** Adds narration to the end of what is being read. Does nothing if speech is off. */
  say(text: string): void {
    this.last = text;
    if (!this.voice || !this.settings.on) return;
    this.queue.push(...sentences(text));
    this.next();
  }

  private next(): void {
    if (!this.voice || this.speaking || this.paused) return;
    const sentence = this.queue.shift();
    if (sentence === undefined) return;
    this.speaking = true;
    this.voice.speak(sentence, { rate: this.settings.rate, voice: this.settings.voice }, () => {
      this.speaking = false;
      this.next();
    });
  }

  pause(): void {
    if (!this.voice) return;
    this.paused = true;
    this.voice.pause();
  }

  resume(): void {
    if (!this.voice) return;
    this.paused = false;
    this.voice.resume();
    this.next();
  }

  /** Stops at once and forgets what was waiting to be read. */
  stop(): void {
    this.queue = [];
    this.speaking = false;
    this.paused = false;
    this.voice?.cancel();
  }

  /** Reads the most recent narration again from the start, even if speech is otherwise off. */
  replay(): void {
    if (!this.voice || !this.last) return;
    this.stop();
    this.queue.push(...sentences(this.last));
    this.next();
  }

  /** Changing the settings takes effect from the next sentence. Turning speech off stops it. */
  update(settings: SpeechSettings): void {
    this.settings = settings;
    if (!settings.on) this.stop();
  }
}

/** The device's own voice, where the browser has one. */
export function deviceVoice(): Voice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const synth = window.speechSynthesis;
  return {
    speak(text, options, onEnd) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate;
      const chosen = synth.getVoices().find((v) => v.name === options.voice);
      if (chosen) utterance.voice = chosen;
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
      synth.speak(utterance);
    },
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    cancel: () => synth.cancel(),
    voices: () =>
      synth
        .getVoices()
        .filter((v) => v.lang.startsWith(navigator.language.slice(0, 2)))
        .map((v) => v.name),
  };
}
