import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES = [
  {
    name: "Smileys",
    icon: "😊",
    emojis: ["😀","😃","😄","😁","😅","😂","🤣","😊","😇","🙂","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","😮‍💨","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","😵‍💫","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"]
  },
  {
    name: "Gestures",
    icon: "👋",
    emojis: ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄"]
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️","💌","💋","🫶"]
  },
  {
    name: "Objects",
    icon: "📦",
    emojis: ["📦","📋","📝","📌","📍","📎","🔗","✂️","📐","📏","📊","📈","📉","🗂️","📁","📂","🗃️","🗄️","🗑️","🔒","🔓","🔑","🗝️","🔨","🪓","⛏️","🔧","🔩","⚙️","🛒","💰","💵","💴","💶","💷","💸","💳","🧾","💹","✉️","📧","📨","📩","📮","📭","📬","📫","📪","📜","📃","📄","📑","🧮","📞","📱","💻","🖥️","⌨️","🖨️","🖱️"]
  },
  {
    name: "Food",
    icon: "🍕",
    emojis: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🥐","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🥛","🍼","🫖","☕","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾"]
  },
  {
    name: "Animals",
    icon: "🐱",
    emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🕸️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🪶","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔"]
  },
  {
    name: "Travel",
    icon: "✈️",
    emojis: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍️","🛵","🚲","🛴","🛹","🛼","🚏","🛣️","🛤️","🛞","⛽","🚨","🚥","🚦","🛑","🚧","⚓","⛵","🛶","🚤","🛳️","⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩️","🕋"]
  },
  {
    name: "Symbols",
    icon: "✅",
    emojis: ["✅","❌","⭕","❗","❓","‼️","⁉️","💯","🔥","✨","⭐","🌟","💫","🎯","🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎪","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🪕","🎻","🎲","♟️","🎯","🎳","🎮","🕹️","🧩","🔔","🔕","🎵","🎶","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔶","🔷","🔸","🔹","▪️","▫️","◾","◽","🔺","🔻","💠","🔘","🔳","🔲"]
  }
];

const RECENT_KEY = "emoji_recent";

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 24);
  } catch { return []; }
}

function addRecent(emoji: string) {
  const recent = getRecent().filter(e => e !== emoji);
  recent.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 24)));
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}

export function EmojiPicker({ onSelect, trigger, align = "start", side = "top" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);
  const [recentEmojis, setRecentEmojis] = useState(getRecent);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const all: string[] = [];
    EMOJI_CATEGORIES.forEach(cat => {
      cat.emojis.forEach(e => {
        if (e.includes(q) || cat.name.toLowerCase().includes(q)) all.push(e);
      });
    });
    return all;
  }, [search]);

  const handleSelect = (emoji: string) => {
    addRecent(emoji);
    setRecentEmojis(getRecent());
    onSelect(emoji);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0 shadow-xl border-0 rounded-xl overflow-hidden"
        align={align}
        side={side}
        sideOffset={8}
      >
        <div className="bg-card">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search emoji..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-muted/50 border-0"
                data-testid="input-emoji-search"
              />
            </div>
          </div>

          {!search && (
            <div className="flex px-1 pt-1 gap-0.5 border-b">
              {recentEmojis.length > 0 && (
                <button
                  onClick={() => setActiveCategory(-1)}
                  className={cn(
                    "px-2 py-1.5 text-sm rounded-t-md transition-colors",
                    activeCategory === -1 ? "bg-muted font-medium" : "hover:bg-muted/50"
                  )}
                  title="Recent"
                >
                  🕐
                </button>
              )}
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(i)}
                  className={cn(
                    "px-2 py-1.5 text-sm rounded-t-md transition-colors",
                    activeCategory === i ? "bg-muted font-medium" : "hover:bg-muted/50"
                  )}
                  title={cat.name}
                >
                  {cat.icon}
                </button>
              ))}
            </div>
          )}

          <div className="h-[220px] overflow-y-auto p-2" data-testid="emoji-grid">
            {filteredEmojis ? (
              filteredEmojis.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No emojis found</div>
              ) : (
                <div className="grid grid-cols-8 gap-0.5">
                  {filteredEmojis.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      onClick={() => handleSelect(emoji)}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-muted rounded-md transition-colors"
                      data-testid={`emoji-${i}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                {activeCategory === -1 && recentEmojis.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground font-medium mb-1 px-1">Recent</p>
                    <div className="grid grid-cols-8 gap-0.5 mb-2">
                      {recentEmojis.map((emoji, i) => (
                        <button
                          key={`recent-${emoji}-${i}`}
                          onClick={() => handleSelect(emoji)}
                          className="w-8 h-8 flex items-center justify-center text-lg hover:bg-muted rounded-md transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {activeCategory >= 0 && (
                  <>
                    <p className="text-xs text-muted-foreground font-medium mb-1 px-1">{EMOJI_CATEGORIES[activeCategory].name}</p>
                    <div className="grid grid-cols-8 gap-0.5">
                      {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
                        <button
                          key={`${emoji}-${i}`}
                          onClick={() => handleSelect(emoji)}
                          className="w-8 h-8 flex items-center justify-center text-lg hover:bg-muted rounded-md transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
