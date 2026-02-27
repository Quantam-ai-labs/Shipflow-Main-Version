import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, User, Volume2, VolumeX, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AIChatMessageProps {
  role: "user" | "assistant";
  content: string;
  onSpeak?: (text: string) => void;
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
}

export function AIChatMessage({ role, content, onSpeak, isSpeaking, onStopSpeaking }: AIChatMessageProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (role === "user") {
    return (
      <div className="flex gap-3 justify-end" data-testid="chat-message-user">
        <div className="max-w-[80%] rounded-lg px-4 py-3 bg-primary text-primary-foreground">
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 justify-start" data-testid="chat-message-assistant">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted">
        <div className="prose prose-sm dark:prose-invert max-w-none
          prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-foreground
          prose-p:my-1 prose-p:leading-relaxed prose-p:text-sm
          prose-li:my-0.5 prose-li:text-sm
          prose-strong:text-foreground
          prose-ul:my-1 prose-ol:my-1
          prose-table:text-xs prose-th:p-2 prose-td:p-2
          prose-code:text-xs prose-code:bg-background/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-background/50 prose-pre:text-xs prose-pre:p-3 prose-pre:rounded-md
          prose-hr:my-2">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        <div className="flex items-center gap-1 mt-2 border-t border-border/50 pt-2">
          {onSpeak && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => isSpeaking ? onStopSpeaking?.() : onSpeak(content)}
              data-testid="btn-speak-message"
            >
              {isSpeaking ? (
                <VolumeX className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleCopy}
            data-testid="btn-copy-message"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start" data-testid="chat-typing-indicator">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="bg-muted rounded-lg px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
