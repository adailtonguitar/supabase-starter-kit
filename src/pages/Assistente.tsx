import { useState, useRef, useEffect, useCallback, Component, ReactNode } from "react";
import { Bot, Send, Headset, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  getResponse,
  getWelcomeMessage,
  createMessage,
  type SupportMessage,
} from "@/services/aiSupportService";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import ReactMarkdown from "react-markdown";

const WHATSAPP_SUPPORT = "https://wa.me/5500000000000";

// Local ErrorBoundary to prevent ReactMarkdown crashes from killing the whole app
class MarkdownErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn("[MarkdownErrorBoundary]", err.message); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 max-w-[80%]">
      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1.5 items-center h-5">
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function SafeMarkdown({ content }: { content: string }) {
  const safeContent = (content || "").replace(/\u0000/g, "");
  return (
    <MarkdownErrorBoundary fallback={<span>{safeContent}</span>}>
      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0">
        <ReactMarkdown>{safeContent}</ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
}

function ChatBubble({ msg }: { msg: SupportMessage }) {
  const isUser = msg.sender === "user";
  const text = msg.message || "";

  return (
    <div className={cn("flex items-end gap-2 max-w-[85%] md:max-w-[70%]", isUser && "ml-auto flex-row-reverse")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {isUser ? text : <SafeMarkdown content={text} />}
        <div className={cn("text-[10px] mt-1 opacity-50", isUser ? "text-right" : "text-left")}>
          {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

export default function Assistente() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [messages, setMessages] = useState<SupportMessage[]>([getWelcomeMessage()]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    scrollToBottom("instant");
  }, []);

  useEffect(() => {
    if (!isTyping) scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
  };

  // Persist message to DB (fire-and-forget, non-critical)
  const persistMessage = (msg: SupportMessage) => {
    try {
      if (!user?.id || !companyId) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (supabase as any).from("support_messages").insert({
        user_id: user.id,
        company_id: companyId,
        message: (msg.message || "").slice(0, 5000),
        sender: msg.sender,
      });
      Promise.resolve(p).catch(() => {});
    } catch {
      // completely silent - persistence is optional
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const userMsg = createMessage("user", trimmed);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    persistMessage(userMsg);

    // Auto-resize textarea back
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setIsTyping(true);

    try {
      // Build conversation history for AI context
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.sender === "user" ? "user" : "assistant", content: m.message }));

      const answer = await getResponse(trimmed, history);
      const botMsg = createMessage("bot", answer);
      setMessages((prev) => [...prev, botMsg]);
      persistMessage(botMsg);
    } catch (err) {
      console.error("[Assistente] Error getting response:", err);
      const errorMsg = createMessage("bot", "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns segundos. 🔄");
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleWhatsApp = () => {
    const botMsg = createMessage("bot", "Você será direcionado para nosso suporte. 📱");
    setMessages((prev) => [...prev, botMsg]);
    persistMessage(botMsg);
    setTimeout(() => window.open(WHATSAPP_SUPPORT, "_blank"), 1000);
  };

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card rounded-t-xl">
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">Assistente Inteligente</h1>
          <p className="text-xs text-muted-foreground">Online • Responde na hora</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleWhatsApp} className="gap-1.5 text-xs">
          <Headset className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Suporte Humano</span>
        </Button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/50"
      >
        {messages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} />
        ))}
        {isTyping && <TypingIndicator />}
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="relative">
          <Button
            size="icon"
            variant="secondary"
            className="absolute -top-12 right-4 rounded-full shadow-lg w-8 h-8"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="border-t bg-card p-3 rounded-b-xl">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua dúvida..."
            className="min-h-[44px] max-h-[120px] resize-none rounded-xl border-muted"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="rounded-xl h-11 w-11 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
