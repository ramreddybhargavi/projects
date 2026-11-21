import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  AudioLines,
  Check,
  ChevronDown,
  Copy,
  History,
  Languages,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
  WandSparkles,
  X,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

type SpeakerProfile = {
  id: string;
  name: string;
  voice_signature: number[];
  created_at: string;
};

type HistoryItem = {
  id: string;
  source_language: string;
  target_language: string;
  source_text: string;
  translated_text: string;
  emotion: string;
  speaker: string;
  style: string;
  created_at: string;
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionWindow = Window & { webkitSpeechRecognition?: new () => Recognition; SpeechRecognition?: new () => Recognition };

type ClarificationOption = {
  text: string;
  label: string;
  description: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const languages = ['English', 'Spanish', 'French', 'German', 'Japanese', 'Korean', 'Portuguese', 'Arabic', 'Hindi', 'Telugu', 'Italian', 'Mandarin', 'Dutch'];
const styles = [
  { name: 'Natural', description: 'Clear and conversational' },
  { name: 'Professional', description: 'Polished and precise' },
  { name: 'Casual', description: 'Friendly and relaxed' },
  { name: 'Warm', description: 'Empathetic and personal' },
];

const languageCodes: Record<string, string> = {
  English: 'en', Spanish: 'es', French: 'fr', German: 'de',
  Japanese: 'ja', Korean: 'ko', Portuguese: 'pt', Arabic: 'ar',
  Hindi: 'hi', Telugu: 'te', Italian: 'it', Mandarin: 'zh-CN', Dutch: 'nl',
};

const speechLangCodes: Record<string, string> = {
  English: 'en-US', Spanish: 'es-ES', French: 'fr-FR', German: 'de-DE',
  Japanese: 'ja-JP', Korean: 'ko-KR', Portuguese: 'pt-BR', Arabic: 'ar-SA',
  Hindi: 'hi-IN', Telugu: 'te-IN', Italian: 'it-IT', Mandarin: 'zh-CN', Dutch: 'nl-NL',
};

async function fetchTranslation(text: string, sourceCode: string, targetCode: string): Promise<string> {
  if (sourceCode === targetCode) return text;

  const googleResponse = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceCode}&tl=${targetCode}&dt=t&q=${encodeURIComponent(text)}`
  );
  if (googleResponse.ok) {
    const googleData: unknown = await googleResponse.json();
    if (Array.isArray(googleData) && Array.isArray(googleData[0])) {
      const translated = googleData[0]
        .filter((part): part is [string] => Array.isArray(part) && typeof part[0] === 'string')
        .map((part) => part[0])
        .join('');
      if (translated) return translated;
    }
  }

  const fallbackResponse = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceCode}|${targetCode}`
  );
  if (!fallbackResponse.ok) throw new Error('Translation service unavailable');
  const fallbackData = await fallbackResponse.json();
  const translated = fallbackData?.responseData?.translatedText ?? '';
  if (!translated || translated.includes('INVALID')) throw new Error('No translation received');
  return translated;
}

function App() {
  const [sourceLanguage, setSourceLanguage] = useState('English');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [style, setStyle] = useState('Natural');
  const [input, setInput] = useState('');
  const [rawInput, setRawInput] = useState('');
  const [translation, setTranslation] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeTab, setActiveTab] = useState('Translate');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [showClarification, setShowClarification] = useState(false);
  const [clarificationOptions, setClarificationOptions] = useState<ClarificationOption[]>([]);
  const [clarificationLoading, setClarificationLoading] = useState(false);
  const [clarificationMessage, setClarificationMessage] = useState('');
  const [speaker, setSpeaker] = useState('Speaker 1');
  const [emotion, setEmotion] = useState('Neutral');
  const [emotionConfidence, setEmotionConfidence] = useState(0);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>([]);
  const [speakerName, setSpeakerName] = useState('');
  const [isSavingSpeaker, setIsSavingSpeaker] = useState(false);
  const [voiceSignature, setVoiceSignature] = useState<number[]>([]);
  const [ttsNotice, setTtsNotice] = useState('');
  const transcriptRef = useRef('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playTokenRef = useRef(0);
  const watchdogRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceSamplesRef = useRef<number[][]>([]);
  const voiceSamplingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('translation_history').select('*').order('created_at', { ascending: false }).limit(8);
      if (data) setHistory(data as HistoryItem[]);
    };
    void loadHistory();
  }, []);

  useEffect(() => {
    const loadSpeakerProfiles = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('speaker_profiles').select('*').order('created_at', { ascending: true });
      if (data) setSpeakerProfiles(data as SpeakerProfile[]);
    };
    void loadSpeakerProfiles();
  }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const emotionDetail = useMemo(() => ({ Neutral: 'balanced', Curious: 'engaged', Calm: 'steady', Warm: 'friendly', Excited: 'energetic' }[emotion] ?? 'balanced'), [emotion]);

  const findVoice = useCallback((lang: string): SpeechSynthesisVoice | null => {
    if (!voices.length) return null;
    const langCode = speechLangCodes[lang] ?? 'en-US';
    const langPrefix = langCode.slice(0, 2).toLowerCase();
    const langName = lang.toLowerCase();

    return (
      voices.find((v) => v.lang === langCode) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ??
      voices.find((v) => v.name.toLowerCase().includes(langName)) ??
      voices.find((v) => v.lang.toLowerCase().replace('-', '').startsWith(langPrefix)) ??
      null
    );
  }, [voices]);

  const stopSpeaking = useCallback(() => {
    playTokenRef.current += 1;
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  // Splits long text into short pieces (online TTS accepts ~200 characters per request).
  const splitForTts = (text: string, max = 170): string[] => {
    const sentences = text.match(/[^.!?।॥\n]+[.!?।॥]*/g) ?? [text];
    const chunks: string[] = [];
    let current = '';
    const push = (piece: string) => {
      if (piece.trim()) chunks.push(piece.trim());
    };
    for (const sentence of sentences) {
      if ((current + sentence).length <= max) {
        current += sentence;
        continue;
      }
      push(current);
      current = '';
      if (sentence.length <= max) {
        current = sentence;
      } else {
        let line = '';
        for (const word of sentence.split(/\s+/)) {
          if ((line + ' ' + word).length > max) {
            push(line);
            line = word;
          } else {
            line = line ? `${line} ${word}` : word;
          }
        }
        current = line;
      }
    }
    push(current);
    return chunks;
  };

  // Online voice fallback: used when the browser/device has no installed voice for the language
  // (this is the usual case for Telugu on Chrome/Edge desktop).
  const playOnlineVoice = useCallback(async (text: string, lang: string) => {
    const code = languageCodes[lang] ?? 'en';
    const token = ++playTokenRef.current;
    setIsPlaying(true);
    setTtsNotice('');
    const buildUrls = (chunk: string) => [
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${code}&q=${encodeURIComponent(chunk)}`,
      `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${code}&q=${encodeURIComponent(chunk)}`,
    ];
    const playUrl = (url: string) =>
      new Promise<boolean>((resolve) => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audioRef.current = audio;
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      });

    for (const chunk of splitForTts(text)) {
      if (token !== playTokenRef.current) return;
      let played = false;
      for (const url of buildUrls(chunk)) {
        if (token !== playTokenRef.current) return;
        played = await playUrl(url);
        if (played) break;
      }
      if (token !== playTokenRef.current) return;
      if (!played) {
        setIsPlaying(false);
        setTtsNotice(`Could not play ${lang} voice. Check your internet connection and tap Play again.`);
        return;
      }
    }
    if (token === playTokenRef.current) {
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  const speak = useCallback((text: string, lang: string) => {
    if (!text) return;
    stopSpeaking();
    setTtsNotice('');
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const match = findVoice(lang);

    // No installed voice for this language (e.g. Telugu) -> use online voice.
    if (!synth || !match) {
      void playOnlineVoice(text, lang);
      return;
    }

    const token = playTokenRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance; // keep a reference so Chrome doesn't garbage-collect it mid-speech
    utterance.voice = match;
    utterance.lang = match.lang;
    utterance.rate = 0.95;

    const fallbackToOnline = () => {
      if (token !== playTokenRef.current) return;
      synth.cancel();
      void playOnlineVoice(text, lang);
    };

    utterance.onstart = () => {
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
    utterance.onend = () => {
      if (token === playTokenRef.current) setIsPlaying(false);
    };
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      fallbackToOnline();
    };

    setIsPlaying(true);
    // Small delay after cancel() avoids Chrome silently dropping the new utterance.
    window.setTimeout(() => {
      if (token !== playTokenRef.current) return;
      synth.resume();
      synth.speak(utterance);
      // If the engine never starts (voice listed but not working), switch to online voice.
      watchdogRef.current = window.setTimeout(fallbackToOnline, 3000);
    }, 60);
  }, [findVoice, playOnlineVoice, stopSpeaking]);

  const saveHistory = async (record: Omit<HistoryItem, 'id' | 'created_at'>) => {
    if (supabase) {
      const { data } = await supabase.from('translation_history').insert(record).select().maybeSingle();
      if (data) setHistory((current) => [data as HistoryItem, ...current].slice(0, 8));
    } else {
      setHistory((current) => [{ ...record, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...current].slice(0, 8));
    }
  };

  const translate = async (text = rawInput || input) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setInput(cleanText);
    setRawInput(cleanText);
    stopSpeaking();
    setIsTranslating(true);
    setTranslation('');
    const sourceCode = languageCodes[sourceLanguage] ?? 'en';
    const targetCode = languageCodes[targetLanguage] ?? 'es';
    try {
      const translated = await fetchTranslation(cleanText, sourceCode, targetCode);
      setTranslation(translated);
      void saveHistory({
        source_language: sourceLanguage, target_language: targetLanguage,
        source_text: cleanText, translated_text: translated,
        emotion, speaker, style,
      });
      speak(translated, targetLanguage);
    } catch {
      setTranslation('Translation service is busy. Please try again.');
    } finally {
      setIsTranslating(false);
    }
  };

  const generateClarification = async (text: string): Promise<{ options: ClarificationOption[]; ambiguous: boolean }> => {
    const cleanText = text.trim();
    if (!cleanText) return { options: [], ambiguous: false };

    const sourceCode = languageCodes[sourceLanguage] ?? 'en';
    const targetCode = languageCodes[targetLanguage] ?? 'es';

    const forwardText = await fetchTranslation(cleanText, sourceCode, targetCode);
    if (!forwardText) return { options: [], ambiguous: false };

    const backText = await fetchTranslation(forwardText, targetCode, sourceCode);

    const normalize = (s: string) => s.toLowerCase().trim().replace(/[.?!,;:'"]/g, '').replace(/\s+/g, ' ');
    const isAmbiguous = backText && normalize(backText) !== normalize(cleanText);

    if (!isAmbiguous) {
      return { options: [], ambiguous: false };
    }

    return {
      options: [
        { text: cleanText, label: 'Original phrasing', description: `Keep your exact words: "${cleanText}"` },
        { text: backText, label: 'Alternative meaning', description: `Refined to convey: "${backText}"` },
      ],
      ambiguous: true,
    };
  };

  const handleClarification = async () => {
    const text = (rawInput || input).trim();
    if (!text) {
      setClarificationMessage('Enter or speak a phrase first, then use AI clarification.');
      setShowClarification(true);
      setClarificationOptions([]);
      return;
    }
    setClarificationLoading(true);
    setShowClarification(true);
    setClarificationMessage('');
    setClarificationOptions([]);
    try {
      const result = await generateClarification(text);
      if (!result.ambiguous) {
        setClarificationMessage('Your phrase is clear — no ambiguity detected. Translating directly.');
        void translate(text);
        window.setTimeout(() => setShowClarification(false), 2000);
      } else {
        setClarificationOptions(result.options);
      }
    } catch {
      setClarificationMessage('Could not analyze the phrase. Please try translating directly.');
    } finally {
      setClarificationLoading(false);
    }
  };

  const getVoiceSignature = (): number[] => {
    const analyser = analyserRef.current;
    if (!analyser) return [];
    const values = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(values);
    const bandStarts = [0, 4, 8, 16, 24, 32, 40, 48];
    return bandStarts.map((start, index) => {
      const end = Math.min(values.length, index === bandStarts.length - 1 ? values.length : bandStarts[index + 1]);
      const slice = Array.from(values.slice(start, end));
      return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length / 255 : 0;
    });
  };

  const closestSpeaker = (signature: number[]): SpeakerProfile | null => {
    if (!signature.length || !speakerProfiles.length) return null;
    return speakerProfiles.reduce((closest, profile) => {
      const distance = profile.voice_signature.reduce((sum, value, index) => sum + Math.abs(value - (signature[index] ?? 0)), 0);
      const closestDistance = closest.voice_signature.reduce((sum, value, index) => sum + Math.abs(value - (signature[index] ?? 0)), 0);
      return distance < closestDistance ? profile : closest;
    });
  };

  const saveSpeakerProfile = async () => {
    const name = speakerName.trim();
    if (!name || !voiceSignature.length) return;
    const profile = { name, voice_signature: voiceSignature };
    if (supabase) {
      const { data } = await supabase.from('speaker_profiles').insert(profile).select().maybeSingle();
      if (data) setSpeakerProfiles((current) => [...current, data as SpeakerProfile]);
    } else {
      setSpeakerProfiles((current) => [...current, { ...profile, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
    }
    setSpeaker(name);
    setSpeakerName('');
    setVoiceSignature([]);
    setIsSavingSpeaker(false);
  };

  const deleteSpeakerProfile = async (id: string) => {
    if (supabase) await supabase.from('speaker_profiles').delete().eq('id', id);
    setSpeakerProfiles((current) => current.filter((profile) => profile.id !== id));
  };

  const detectEmotion = (samples: number[][]): { emotion: string; confidence: number } => {
    if (!samples.length) return { emotion: 'Neutral', confidence: 0 };

    const numBands = samples[0].length;
    const avgSignature = Array.from({ length: numBands }, (_, i) =>
      samples.reduce((sum, s) => sum + (s[i] ?? 0), 0) / samples.length
    );

    const lowEnergy = (avgSignature[0] + avgSignature[1]) / 2;
    const midEnergy = (avgSignature[2] + avgSignature[3]) / 2;
    const highEnergy = (avgSignature[4] + avgSignature[5] + avgSignature[6] + avgSignature[7]) / 4;

    const energyValues = samples.map((s) => (s[0] + s[1]) / 2);
    const energyMean = energyValues.reduce((a, b) => a + b, 0) / energyValues.length;
    const energyVariance = energyValues.reduce((sum, v) => sum + Math.pow(v - energyMean, 2), 0) / energyValues.length;

    const totalEnergy = avgSignature.reduce((a, b) => a + b, 0);
    const centroid = totalEnergy > 0
      ? avgSignature.reduce((sum, val, idx) => sum + val * idx, 0) / totalEnergy
      : 0;

    if (lowEnergy > 0.45 && energyVariance > 0.015) {
      return { emotion: 'Excited', confidence: Math.min(95, 75 + Math.round(energyVariance * 200)) };
    }
    if (lowEnergy > 0.25 && centroid > 3.5) {
      return { emotion: 'Curious', confidence: Math.min(92, 72 + Math.round(centroid * 4)) };
    }
    if (lowEnergy < 0.18 && energyVariance < 0.008) {
      return { emotion: 'Calm', confidence: Math.min(90, 70 + Math.round((1 - lowEnergy) * 25)) };
    }
    if (lowEnergy >= 0.18 && lowEnergy <= 0.45 && energyVariance < 0.012 && midEnergy > highEnergy) {
      return { emotion: 'Warm', confidence: Math.min(88, 70 + samples.length) };
    }
    return { emotion: 'Neutral', confidence: Math.min(80, 65 + samples.length) };
  };

  const startRecording = async () => {
    const recognitionConstructor = (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition;
    if (!recognitionConstructor) {
      setInput('Voice capture is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        setInput('Audio analysis is not supported in this browser.');
        return;
      }
      audioContextRef.current = new AudioContextClass();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.6;
      source.connect(analyserRef.current);
      voiceSamplesRef.current = [];
      voiceSamplingTimerRef.current = window.setInterval(() => {
        const sample = getVoiceSignature();
        if (sample.length) voiceSamplesRef.current.push(sample);
      }, 100);
    } catch {
      setInput('Microphone permission is needed for voice input.');
      return;
    }
    const nextRecognition = new recognitionConstructor();
    nextRecognition.continuous = false;
    nextRecognition.interimResults = true;
    nextRecognition.lang = speechLangCodes[sourceLanguage] ?? 'en-US';
    nextRecognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index][0].transcript).join('');
      transcriptRef.current = transcript;
      setRawInput(transcript);
      setInput(transcript);
    };
    nextRecognition.onend = () => {
      if (voiceSamplingTimerRef.current !== null) window.clearInterval(voiceSamplingTimerRef.current);
      const samples = voiceSamplesRef.current;
      const signature = samples.length
        ? samples[0].map((_, index) => samples.reduce((sum, sample) => sum + (sample[index] ?? 0), 0) / samples.length)
        : getVoiceSignature();
      setVoiceSignature(signature);
      const matchedSpeaker = closestSpeaker(signature);
      if (matchedSpeaker) setSpeaker(matchedSpeaker.name);
      const detected = detectEmotion(samples);
      setEmotion(detected.emotion);
      setEmotionConfidence(detected.confidence);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      setIsRecording(false);
      if (!isSavingSpeaker && transcriptRef.current) void translate(transcriptRef.current);
    };
    setRecognition(nextRecognition);
    setIsRecording(true);
    nextRecognition.start();
  };

  const stopRecording = () => {
    recognition?.stop();
    if (voiceSamplingTimerRef.current !== null) window.clearInterval(voiceSamplingTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
  };

  const swapLanguages = () => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setRawInput(translation);
    setInput(translation);
    setTranslation(rawInput || input);
  };

  const copyTranslation = async () => {
    if (!translation) return;
    await navigator.clipboard?.writeText(translation);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const playTranslation = () => {
    if (!translation) return;
    if (isPlaying) {
      stopSpeaking();
      return;
    }
    speak(translation, targetLanguage);
  };

  const chooseClarification = (phrase: string) => {
    setRawInput(phrase);
    setInput(phrase);
    setShowClarification(false);
    void translate(phrase);
  };

  const clearHistory = async () => {
    if (supabase) await supabase.from('translation_history').delete().neq('id', '');
    setHistory([]);
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="workspace">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark"><AudioLines size={24} strokeWidth={2.5} /></div>
            <div>
              <h1>voicetovoice <span>translator</span></h1>
              <p>Understand every voice, in every language.</p>
            </div>
          </div>
          <div className="status-pill"><span className="status-dot" /> Live AI workspace</div>
        </header>

        <nav className="tabs" aria-label="Workspace sections">
          {['Translate', 'Speakers', 'Styles', 'History'].map((tab) => (
            <button key={tab} className={activeTab === tab ? 'tab active' : 'tab'} onClick={() => setActiveTab(tab)}>
              {tab === 'Translate' && <Languages size={15} />}
              {tab === 'Speakers' && <UserRound size={15} />}
              {tab === 'Styles' && <WandSparkles size={15} />}
              {tab === 'History' && <History size={15} />}
              {tab}
              {tab === 'History' && history.length > 0 && <span className="tab-count">{history.length}</span>}
            </button>
          ))}
        </nav>

        {activeTab === 'History' ? (
          <section className="history-view panel enter-up">
            <div className="section-heading"><div><p className="eyebrow">Your conversations</p><h2>Translation history</h2></div><button className="ghost-button" onClick={clearHistory}><Trash2 size={16} /> Clear all</button></div>
            {history.length === 0 ? <div className="empty-state"><History size={30} /><p>Your translated phrases will appear here.</p></div> : <div className="history-list">{history.map((item) => <button className="history-row" key={item.id} onClick={() => { setRawInput(item.source_text); setInput(item.source_text); setTranslation(item.translated_text); setSourceLanguage(item.source_language); setTargetLanguage(item.target_language); setActiveTab('Translate'); }}><div className="history-languages">{item.source_language.slice(0, 2).toUpperCase()} <ArrowLeftRight size={13} /> {item.target_language.slice(0, 2).toUpperCase()}</div><div className="history-copy"><strong>{item.source_text}</strong><span>{item.translated_text}</span></div><span className="history-time">{new Date(item.created_at).toLocaleDateString()}</span></button>)}</div>}
          </section>
        ) : activeTab === 'Speakers' ? (
          <section className="history-view panel enter-up">
            <div className="section-heading"><div><p className="eyebrow">Voice recognition</p><h2>Saved speakers</h2></div><span className="insight-chip"><UserRound size={13} /> {speakerProfiles.length} profiles</span></div>
            <p className="modal-copy">Save a short voice sample so the translator can recognize who is speaking next time. Only a small acoustic signature is saved, never the recording.</p>
            <div className="speaker-tools">
              <input className="speaker-input" value={speakerName} onChange={(event) => setSpeakerName(event.target.value)} placeholder="Name this speaker" aria-label="Speaker name" />
              <button className="primary-button" onClick={() => { setIsSavingSpeaker(true); void startRecording(); }} disabled={isRecording || !speakerName.trim()}><Mic size={16} /> {isRecording && isSavingSpeaker ? 'Recording sample' : 'Record voice sample'}</button>
              {voiceSignature.length > 0 && !isRecording && <button className="ghost-button" onClick={() => void saveSpeakerProfile()}><Check size={16} /> Save profile</button>}
            </div>
            <div className="speaker-list">{speakerProfiles.length === 0 ? <div className="empty-state"><UserRound size={30} /><p>No saved voices yet. Record the first profile above.</p></div> : speakerProfiles.map((profile) => <div className="speaker-row" key={profile.id}><div className="speaker-avatar"><UserRound size={18} /></div><div><strong>{profile.name}</strong><span>Voice profile saved {new Date(profile.created_at).toLocaleDateString()}</span></div><button className="icon-button" onClick={() => void deleteSpeakerProfile(profile.id)} aria-label={`Delete ${profile.name}`}><Trash2 size={15} /></button></div>)}</div>
          </section>
        ) : activeTab === 'Styles' ? (
          <section className="history-view panel enter-up">
            <div className="section-heading"><div><p className="eyebrow">Translation personality</p><h2>Personal styles</h2></div><span className="insight-chip"><WandSparkles size={13} /> Active: {style}</span></div>
            <p className="modal-copy">Choose how your translations should sound. The selected style is applied every time you translate.</p>
            <div className="style-grid">{styles.map((option) => <button key={option.name} className={style === option.name ? 'style-option selected' : 'style-option'} onClick={() => setStyle(option.name)}><div className="style-option-icon"><WandSparkles size={18} /></div><div><strong>{option.name}</strong><span>{option.description}</span></div>{style === option.name && <Check size={17} />}</button>)}</div>
            <button className="primary-button style-continue" onClick={() => setActiveTab('Translate')}><Languages size={16} /> Use {style} style</button>
          </section>
        ) : (
          <>
            <section className="language-panel panel enter-up">
              <div className="language-field"><label>Speaking in</label><div className="select-wrap"><select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>{languages.map((language) => <option key={language}>{language}</option>)}</select><ChevronDown size={17} /></div></div>
              <button className="swap-button" onClick={swapLanguages} aria-label="Swap languages"><ArrowLeftRight size={18} /></button>
              <div className="language-field"><label>Translate to</label><div className="select-wrap"><select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>{languages.filter((language) => language !== sourceLanguage).map((language) => <option key={language}>{language}</option>)}</select><ChevronDown size={17} /></div></div>
              <div className="style-field"><label>Personal translation style</label><div className="select-wrap"><select value={style} onChange={(event) => setStyle(event.target.value)}>{styles.map((option) => <option key={option.name}>{option.name}</option>)}</select><ChevronDown size={17} /></div></div>
            </section>

            <div className="translation-grid">
              <section className="input-panel panel enter-up delay-one">
                <div className="panel-toolbar"><div className="mode-switch"><button className="mode active">Type</button><button className="mode" onClick={startRecording}><Mic size={14} /> Voice</button></div><span className="live-label"><span className="mini-dot" /> {isRecording ? 'Listening' : 'Ready'}</span></div>
                <textarea value={input} onChange={(event) => { const value = event.target.value; setInput(value); setRawInput(value); }} placeholder="Say or type something to translate..." aria-label="Text to translate" />
                <div className="input-footer"><span>{input.length} characters</span><button className={isRecording ? 'record-button recording' : 'record-button'} onClick={isRecording ? stopRecording : startRecording}>{isRecording ? <><Pause size={16} /> Stop listening</> : <><Mic size={16} /> Speak</>}</button><button className="primary-button" onClick={() => void translate()} disabled={isTranslating}>{isTranslating ? <><span className="spinner" /> Translating</> : <><Sparkles size={16} /> Translate</>}</button></div>
              </section>

              <section className={translation ? 'output-panel panel has-result enter-up delay-two' : 'output-panel panel enter-up delay-two'}>
                <div className="panel-toolbar"><span className="output-label"><Sparkles size={15} /> Translation</span><div className="output-actions">{translation && <><button className="icon-button" onClick={playTranslation} aria-label="Play translation">{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button><button className="icon-button" onClick={() => void copyTranslation()} aria-label="Copy translation">{copied ? <Check size={16} /> : <Copy size={16} />}</button></>}</div></div>
                {isTranslating ? <div className="placeholder-result"><div className="placeholder-icon spinning"><AudioLines size={25} /></div><p>Translating to {targetLanguage}...</p><span>Matching voice and tone</span></div> : translation ? <div className="result-content"><p className="translated-text">{translation}</p><div className="insight-row"><span className="insight-chip emotion-chip"><span className="chip-orb" /> {emotion} tone</span><span className="insight-chip"><UserRound size={13} /> {speaker}</span><span className="insight-chip"><WandSparkles size={13} /> {style}</span></div><button className="audio-preview" onClick={playTranslation}><div className="audio-icon"><Volume2 size={17} /></div><div className="waveform">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ height: `${12 + ((index * 17) % 20)}px` }} />)}</div><span>{isPlaying ? 'Playing audio' : 'Listen to translation'}</span><span className="audio-duration">{targetLanguage}</span></button>{ttsNotice && <p className="modal-copy" role="alert">{ttsNotice}</p>}</div> : <div className="placeholder-result"><div className="placeholder-icon"><AudioLines size={25} /></div><p>Your translation will appear here</p><span>Use your voice or type a phrase to get started</span></div>}
              </section>
            </div>

            <section className="insights-grid enter-up delay-three">
              <button className="insight-card" onClick={() => setSpeaker(speaker === 'Speaker 1' ? 'Speaker 2' : 'Speaker 1')}><div className="card-icon blue"><UserRound size={18} /></div><div><p>Speaker identification</p><strong>{speaker}</strong><span>Click to switch speaker</span></div><div className="card-arrow"><RotateCcw size={15} /></div></button>
              <div className="insight-card emotion-display"><div className="card-icon coral"><AudioLines size={18} /></div><div><p>Voice emotion</p><strong>{emotion} <span className="confidence">{emotionConfidence > 0 ? `${emotionConfidence}%` : 'Awaiting voice'}</span></strong><span>Your voice sounds {emotionDetail}</span></div><div className="confidence-bar"><i style={{ width: `${emotionConfidence > 0 ? emotionConfidence : 0}%` }} /></div></div>
              <button className="insight-card clarification-card" onClick={() => void handleClarification()} disabled={clarificationLoading}><div className="card-icon yellow"><Sparkles size={18} /></div><div><p>AI clarification</p><strong>{clarificationLoading ? 'Analyzing...' : 'Check clarity'}</strong><span>Resolve ambiguous phrases</span></div><div className="card-arrow"><ChevronDown size={15} /></div></button>
            </section>
          </>
        )}

        <footer className="footer-note"><span><span className="secure-dot" /> Audio is processed privately and never stored.</span><span>Powered by voice intelligence <AudioLines size={13} /></span></footer>
      </section>

      {showClarification && <div className="modal-backdrop" onClick={() => setShowClarification(false)}><div className="clarification-modal" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setShowClarification(false)}><X size={18} /></button><div className="modal-icon"><Sparkles size={21} /></div><p className="eyebrow">AI clarification</p><h2>What did you mean?</h2>{clarificationLoading ? <div className="placeholder-result"><div className="placeholder-icon spinning"><AudioLines size={25} /></div><p>Analyzing your phrase...</p><span>Detecting possible ambiguity</span></div> : clarificationMessage ? <p className="modal-copy">{clarificationMessage}</p> : <><p className="modal-copy">Your phrase could be understood in two ways. Choose the meaning that best matches what you want to say.</p><div className="clarification-options">{clarificationOptions.map((option, index) => <button key={index} onClick={() => chooseClarification(option.text)}><span>{String.fromCharCode(65 + index)}</span><div><strong>{option.label}</strong><small>{option.description}</small></div></button>)}</div></>}</div></div>}
    </main>
  );
}

export default App;
