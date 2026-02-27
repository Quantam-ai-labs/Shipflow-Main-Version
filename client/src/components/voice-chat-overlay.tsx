import { useState, useEffect, useRef, useCallback } from "react";
import { X, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

type VoiceState = "listening" | "thinking" | "speaking" | "idle";

interface VoiceChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (question: string) => Promise<string>;
  language: "en" | "ur";
}

export function VoiceChatOverlay({ isOpen, onClose, onSendMessage, language }: VoiceChatOverlayProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const recognitionRef = useRef<any>(null);
  const isClosingRef = useRef(false);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === "ur" ? "ur-PK" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(final || interim);
    };

    recognition.onend = () => {
      if (isClosingRef.current) return;
      setTranscript((current) => {
        if (current.trim()) {
          handleSendVoice(current.trim());
        } else {
          setVoiceState("idle");
        }
        return current;
      });
    };

    recognition.onerror = (event: any) => {
      if (event.error === "aborted" || isClosingRef.current) return;
      if (event.error === "no-speech") {
        setVoiceState("idle");
        setTranscript("");
        return;
      }
      setVoiceState("idle");
      setTranscript("");
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setAiResponse("");
    setVoiceState("listening");
    recognition.start();
  }, [language]);

  const handleSendVoice = useCallback(async (question: string) => {
    setVoiceState("thinking");
    try {
      const response = await onSendMessage(question);
      if (isClosingRef.current) return;
      setAiResponse(response);
      setVoiceState("speaking");

      window.speechSynthesis.cancel();
      const plainText = response.replace(/[#*_~`|>]/g, "").replace(/\-{2,}/g, "").replace(/\n+/g, ". ").replace(/\s+/g, " ").trim();
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.lang = language === "ur" ? "ur-PK" : "en-US";
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        if (isClosingRef.current) return;
        setVoiceState("idle");
        setTranscript("");
        setAiResponse("");
        setTimeout(() => {
          if (!isClosingRef.current) {
            startListening();
          }
        }, 500);
      };

      utterance.onerror = () => {
        if (isClosingRef.current) return;
        setVoiceState("idle");
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      if (isClosingRef.current) return;
      setVoiceState("idle");
      setTranscript("");
    }
  }, [onSendMessage, language, startListening]);

  useEffect(() => {
    if (isOpen) {
      isClosingRef.current = false;
      const timer = setTimeout(() => startListening(), 300);
      return () => clearTimeout(timer);
    } else {
      isClosingRef.current = true;
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      setVoiceState("idle");
      setTranscript("");
      setAiResponse("");
    }
  }, [isOpen, startListening]);

  function handleClose() {
    isClosingRef.current = true;
    window.speechSynthesis.cancel();
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    setVoiceState("idle");
    onClose();
  }

  function handleOrbTap() {
    if (voiceState === "listening") {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    } else if (voiceState === "speaking") {
      window.speechSynthesis.cancel();
      setVoiceState("idle");
      setTranscript("");
      setAiResponse("");
      setTimeout(() => startListening(), 300);
    } else if (voiceState === "idle") {
      startListening();
    }
  }

  if (!isOpen) return null;

  const stateLabel = {
    idle: language === "ur" ? "بولنے کے لیے ٹیپ کریں" : "Tap to speak",
    listening: language === "ur" ? "سن رہا ہوں..." : "Listening...",
    thinking: language === "ur" ? "سوچ رہا ہوں..." : "Thinking...",
    speaking: language === "ur" ? "بول رہا ہوں..." : "Speaking...",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="voice-overlay">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />

      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-lg px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 z-20 fixed"
          data-testid="btn-close-voice"
        >
          <X className="h-6 w-6" />
        </Button>

        <div className="absolute top-6 left-6 fixed z-20">
          <span className="text-xs text-white/50 bg-white/10 px-2.5 py-1 rounded-full" data-testid="voice-language-badge">
            {language === "ur" ? "اردو" : "English"}
          </span>
        </div>

        <div className="relative flex items-center justify-center mb-8" onClick={handleOrbTap} data-testid="voice-orb">
          {voiceState === "listening" && (
            <>
              <div className="absolute w-40 h-40 rounded-full bg-primary/10 animate-voice-ripple-1" />
              <div className="absolute w-48 h-48 rounded-full bg-primary/5 animate-voice-ripple-2" />
              <div className="absolute w-56 h-56 rounded-full bg-primary/[0.03] animate-voice-ripple-3" />
            </>
          )}

          {voiceState === "thinking" && (
            <div className="absolute w-36 h-36 rounded-full border-2 border-primary/30 border-t-primary animate-spin" style={{ animationDuration: "1.5s" }} />
          )}

          {voiceState === "speaking" && (
            <>
              <div className="absolute w-40 h-40 rounded-full bg-green-500/10 animate-voice-speak-1" />
              <div className="absolute w-44 h-44 rounded-full bg-green-500/5 animate-voice-speak-2" />
            </>
          )}

          <div
            className={`relative w-28 h-28 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 ${
              voiceState === "listening"
                ? "bg-primary shadow-[0_0_40px_rgba(var(--primary-rgb,99,102,241),0.4)] animate-voice-pulse"
                : voiceState === "thinking"
                ? "bg-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)]"
                : voiceState === "speaking"
                ? "bg-green-500 shadow-[0_0_30px_rgba(34,197,94,0.3)] animate-voice-speak-pulse"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            <Mic className={`h-10 w-10 ${voiceState === "idle" ? "text-white/70" : "text-white"}`} />
          </div>
        </div>

        <p className="text-white/80 text-lg font-medium mb-4" data-testid="voice-state-label">
          {stateLabel[voiceState]}
        </p>

        {transcript && voiceState === "listening" && (
          <div className="text-center px-4 max-w-md" data-testid="voice-transcript">
            <p className="text-white/90 text-base leading-relaxed" dir={language === "ur" ? "rtl" : "ltr"}>
              "{transcript}"
            </p>
          </div>
        )}

        {transcript && voiceState === "thinking" && (
          <div className="text-center px-4 max-w-md" data-testid="voice-sent-question">
            <p className="text-white/50 text-sm" dir={language === "ur" ? "rtl" : "ltr"}>
              "{transcript}"
            </p>
          </div>
        )}

        {aiResponse && voiceState === "speaking" && (
          <div className="text-center px-4 max-w-md mt-2 max-h-40 overflow-y-auto" data-testid="voice-ai-response">
            <p className="text-white/70 text-sm leading-relaxed" dir={language === "ur" ? "rtl" : "ltr"}>
              {aiResponse.replace(/[#*_~`|>]/g, "").replace(/\-{2,}/g, "").substring(0, 300)}
              {aiResponse.length > 300 ? "..." : ""}
            </p>
          </div>
        )}

        {voiceState === "idle" && (
          <p className="text-white/40 text-xs mt-4">
            {language === "ur" ? "مائیکروفون بٹن دبائیں اور بولیں" : "Tap the microphone and start speaking"}
          </p>
        )}
      </div>

      <style>{`
        @keyframes voice-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes voice-ripple-1 {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes voice-ripple-2 {
          0% { transform: scale(0.8); opacity: 0.4; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes voice-ripple-3 {
          0% { transform: scale(0.8); opacity: 0.2; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes voice-speak-1 {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.15; }
        }
        @keyframes voice-speak-2 {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.15); opacity: 0.08; }
        }
        @keyframes voice-speak-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .animate-voice-pulse {
          animation: voice-pulse 2s ease-in-out infinite;
        }
        .animate-voice-ripple-1 {
          animation: voice-ripple-1 2s ease-out infinite;
        }
        .animate-voice-ripple-2 {
          animation: voice-ripple-1 2s ease-out infinite 0.5s;
        }
        .animate-voice-ripple-3 {
          animation: voice-ripple-1 2s ease-out infinite 1s;
        }
        .animate-voice-speak-1 {
          animation: voice-speak-1 1.5s ease-in-out infinite;
        }
        .animate-voice-speak-2 {
          animation: voice-speak-2 1.5s ease-in-out infinite 0.3s;
        }
        .animate-voice-speak-pulse {
          animation: voice-speak-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
