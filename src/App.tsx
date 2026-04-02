import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Play, Square, Loader2, Download, Sparkles, AudioLines, Infinity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper to convert raw PCM to WAV Blob
function pcmToWav(pcmData: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    view.setInt16(offset, pcmData[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function base64ToWavBlob(base64: string, sampleRate: number = 24000): Blob {
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const pcmData = new Int16Array(bytes.buffer);
  return pcmToWav(pcmData, sampleRate);
}

const AudioPlayer = ({ url }: { url: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [url]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800/80 p-5 rounded-3xl flex items-center gap-5 shadow-2xl shadow-black/50">
      <audio ref={audioRef} src={url} autoPlay />
      
      <button 
        onClick={togglePlay}
        className="w-14 h-14 flex items-center justify-center bg-zinc-100 hover:bg-white text-zinc-950 rounded-full transition-transform active:scale-95 shadow-lg shrink-0"
      >
        {isPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
      </button>

      <div className="flex-1 flex flex-col gap-2">
        <div className="flex justify-between text-sm font-medium text-zinc-400 px-1">
          <span className="text-zinc-100">{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50 relative cursor-pointer"
             onClick={(e) => {
               if (audioRef.current && duration) {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const pos = (e.clientX - rect.left) / rect.width;
                 audioRef.current.currentTime = pos * duration;
               }
             }}>
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <a 
        href={url} 
        download="auravoice.wav"
        className="w-12 h-12 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-full transition-colors shrink-0"
        title="Download Audio"
      >
        <Download className="w-5 h-5" />
      </a>
    </div>
  );
};

export default function App() {
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeholders = [
    "Type your text here in Hindi or English...",
    "Namaste! Main aapka naya AI voice assistant hoon...",
    "Welcome to AuraVoice. Experience crystal clear voice generation.",
    "Enter any text to hear it spoken in a highly realistic, charming voice.",
  ];
  const [placeholder, setPlaceholder] = useState(placeholders[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholder(placeholders[Math.floor(Math.random() * placeholders.length)]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    
    let finalContentToSpeak = text.trim();
    
    try {
      setStatusText('Correcting typos...');
      
      try {
        // Step 1: Auto-correct the text for crystal clear TTS
        const textResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: text,
          config: {
            systemInstruction: "You are an expert proofreader. Fix spelling or typing mistakes in the text (Hindi, English, or Hinglish). CRITICAL: Remove all commas, periods, line breaks, and punctuation marks so the speech flows continuously without ANY pauses or spaces in the middle. Output ONLY the continuous corrected text, nothing else. Do not wrap in quotes.",
            temperature: 0.1,
          }
        });
        
        const correctedText = textResponse.text?.trim();
        if (correctedText && correctedText !== text) {
          finalContentToSpeak = correctedText;
          setText(correctedText); // Update UI with corrected text
        }
      } catch (correctionError) {
        console.warn("Auto-correction failed, proceeding with original text:", correctionError);
      }

      setStatusText('Generating voice...');
      
      // Step 2: Generate Audio using 'Puck' (Young boy voice)
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: finalContentToSpeak }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' }, // Puck is a charming, youthful male voice
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const blob = base64ToWavBlob(base64Audio);
        const url = URL.createObjectURL(blob);
        setAudioUrl(prevUrl => {
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          return url;
        });
      } else {
        throw new Error("No audio data received from the model.");
      }
    } catch (err: any) {
      console.error("TTS Generation Error:", err);
      setError(err.message || "Failed to generate audio. Please try again.");
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans relative overflow-hidden flex flex-col">
      {/* Background effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 py-12 relative z-10 w-full flex-1 flex flex-col">
        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <AudioLines className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold tracking-tight">AuraVoice</h1>
          </div>
          <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-full">
            <Infinity className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-300">Unlimited Credits</span>
          </div>
        </header>

        <main className="space-y-8 flex-1 flex flex-col justify-center">
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-500">
              Bring your words to life.
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Experience our ultra-realistic, crystal-clear male voice. Type your text in Hindi or English to hear the magic. Perfect for storytelling and voiceovers.
            </p>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-2 shadow-2xl">
            <div className="bg-zinc-950 rounded-[1.25rem] p-6 border border-zinc-800/50">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                className="w-full h-48 bg-transparent text-zinc-100 placeholder:text-zinc-600 text-xl resize-none focus:outline-none"
              />
              
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/50">
                <span className="text-sm text-zinc-500 font-medium flex items-center gap-1.5">
                  {text.length} characters <span className="text-indigo-400/70 text-xs px-1.5 py-0.5 rounded bg-indigo-500/10">Unlimited</span>
                </span>
                
                <button
                  onClick={handleGenerate}
                  disabled={!text.trim() || isGenerating}
                  className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-6 py-3 rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {statusText || 'Generating...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Voice
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="h-24">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-sm text-center"
                >
                  {error}
                </motion.div>
              )}

              {audioUrl && !isGenerating && !error && (
                <motion.div
                  key="player"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <AudioPlayer url={audioUrl} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
