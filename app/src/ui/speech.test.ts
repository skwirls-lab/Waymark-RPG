import { DEFAULT_SPEECH, Narrator, loadSpeech, saveSpeech, sentences, type Voice } from './speech';

/** A voice that records what it was asked to say, and finishes a sentence only when told to. */
function fakeVoice() {
  const spoken: { text: string; rate: number; voice: string | null }[] = [];
  const log: string[] = [];
  let end: (() => void) | null = null;
  const voice: Voice = {
    speak(text, options, onEnd) {
      spoken.push({ text, ...options });
      end = onEnd;
    },
    pause: () => log.push('pause'),
    resume: () => log.push('resume'),
    cancel: () => {
      log.push('cancel');
      end = null;
    },
    voices: () => ['Aria', 'Rowan'],
  };
  return { voice, spoken, log, finish: () => end?.() };
}

describe('spoken narration', () => {
  it('reads narration a sentence at a time, in order', () => {
    const v = fakeVoice();
    const narrator = new Narrator(v.voice, DEFAULT_SPEECH);
    narrator.say('The bridge sways. A rope snaps!');
    narrator.say('What do you do?');
    expect(v.spoken.map((s) => s.text)).toEqual(['The bridge sways.']);
    v.finish();
    v.finish();
    expect(v.spoken.map((s) => s.text)).toEqual([
      'The bridge sways.',
      'A rope snaps!',
      'What do you do?',
    ]);
    v.finish();
    expect(narrator.pending).toBe(0);
  });

  it('pauses and carries on from where it stopped', () => {
    const v = fakeVoice();
    const narrator = new Narrator(v.voice, DEFAULT_SPEECH);
    narrator.say('One. Two. Three.');
    narrator.pause();
    expect(narrator.isPaused).toBe(true);
    v.finish();
    expect(v.spoken).toHaveLength(1);
    narrator.resume();
    expect(v.spoken.map((s) => s.text)).toEqual(['One.', 'Two.']);
    expect(v.log).toEqual(['pause', 'resume']);
  });

  it('replays the last narration from the start', () => {
    const v = fakeVoice();
    const narrator = new Narrator(v.voice, DEFAULT_SPEECH);
    narrator.say('First thing.');
    v.finish();
    narrator.say('Second thing. And more.');
    v.finish();
    v.finish();
    narrator.replay();
    expect(v.spoken.at(-1)!.text).toBe('Second thing.');
    expect(v.log).toContain('cancel');
  });

  it('stop forgets what was waiting', () => {
    const v = fakeVoice();
    const narrator = new Narrator(v.voice, DEFAULT_SPEECH);
    narrator.say('One. Two. Three.');
    narrator.stop();
    v.finish();
    expect(v.spoken).toHaveLength(1);
    expect(narrator.pending).toBe(0);
  });

  it('with speech off nothing is spoken, but replay still works when asked', () => {
    const v = fakeVoice();
    const narrator = new Narrator(v.voice, { ...DEFAULT_SPEECH, on: false });
    narrator.say('Quiet words.');
    expect(v.spoken).toEqual([]);
    narrator.replay();
    expect(v.spoken.map((s) => s.text)).toEqual(['Quiet words.']);
  });

  it('turning speech off mid-sentence stops it', () => {
    const v = fakeVoice();
    const narrator = new Narrator(v.voice, DEFAULT_SPEECH);
    narrator.say('One. Two.');
    narrator.update({ ...DEFAULT_SPEECH, on: false });
    expect(v.log).toEqual(['cancel']);
    narrator.say('Three.');
    expect(v.spoken).toHaveLength(1);
  });

  it('uses the chosen voice and speed from the next sentence', () => {
    const v = fakeVoice();
    const narrator = new Narrator(v.voice, DEFAULT_SPEECH);
    narrator.say('One. Two.');
    narrator.update({ on: true, rate: 1.4, voice: 'Rowan' });
    v.finish();
    expect(v.spoken[1]).toEqual({ text: 'Two.', rate: 1.4, voice: 'Rowan' });
  });

  it('on a device with no voice, everything is a harmless no-op', () => {
    const narrator = new Narrator(null, DEFAULT_SPEECH);
    expect(narrator.available).toBe(false);
    narrator.say('Hello.');
    narrator.pause();
    narrator.resume();
    narrator.replay();
    narrator.stop();
    expect(narrator.pending).toBe(0);
  });

  it('splits on sentence ends and line breaks', () => {
    expect(sentences('One. Two!  Three?\n\nFour')).toEqual(['One.', 'Two!', 'Three?', 'Four']);
    expect(sentences('   ')).toEqual([]);
  });

  it('remembers the settings, and survives nonsense in storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(loadSpeech(storage)).toEqual(DEFAULT_SPEECH);
    saveSpeech({ on: false, rate: 1.3, voice: 'Aria' }, storage);
    expect(loadSpeech(storage)).toEqual({ on: false, rate: 1.3, voice: 'Aria' });
    store.set('waymark.speech', '{"rate": 9, "on": "yes"}');
    expect(loadSpeech(storage)).toEqual({ on: true, rate: 1.6, voice: null });
    store.set('waymark.speech', 'not json');
    expect(loadSpeech(storage)).toEqual(DEFAULT_SPEECH);
  });
});
