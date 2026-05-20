"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Check,
  X,
  Mail,
  Bell,
  BellRing,
  Tag,
  User,
  VolumeX,
  LogOut,
  AlertCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Download,
  Trash2,
  Pin,
  Plus,
  ChevronLeft,
  BrainCircuit,
  ShieldAlert,
  Send,
  Menu,
  Loader2,
  Palette,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OushiMark } from "@/components/oushi-mark";
import { AmbientBackground } from "@/components/ambient-bg";
import {
  TodayModeToggle,
  readStoredTodayMode,
  writeStoredTodayMode,
  type TodayMode,
} from "@/components/today-mode-toggle";

interface Profile {
  bio: string;
  interests: string[];
  priorities: string[];
  noise: string[];
  voice_profile: string | null;
  voice_learned_at: string | null;
}

interface Mute {
  id: string;
  mute_type: string;
  value: string;
  created_at: string;
}

interface SyncState {
  digest_enabled: boolean;
  digest_hour_utc: number;
  last_digest_sent_at: string | null;
  last_synced_at: string | null;
}

type MemoryKind = "person" | "project" | "commitment" | "deadline" | "preference" | "context";

interface Memory {
  id: string;
  kind: MemoryKind;
  subject: string;
  content: string;
  pinned: boolean;
  confidence: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

interface SettingsClientProps {
  profile: Profile | null;
  mutes: Mute[];
  userEmail: string;
  syncState: SyncState | null;
  hasGmail: boolean;
  memories: Memory[];
}

type SettingsSection = "profile" | "appearance" | "voice" | "memory" | "briefing" | "notifications" | "labels" | "filters" | "account";

const KIND_LABELS: Record<MemoryKind, string> = {
  person: "People",
  project: "Projects",
  commitment: "Commitments",
  deadline: "Deadlines",
  preference: "Preferences",
  context: "Context",
};

export function SettingsClient({
  profile,
  mutes: initialMutes,
  userEmail,
  syncState,
  hasGmail,
  memories: initialMemories,
}: SettingsClientProps) {
  const router = useRouter();
  const [section, setSection] = useState<SettingsSection>("profile");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const pickSection = (s: SettingsSection) => {
    setSection(s);
    if (isMobile) setSidebarOpen(false);
  };

  // ===== Profile state =====
  const [bio, setBio] = useState(profile?.bio || "");
  const [interests, setInterests] = useState<string[]>(profile?.interests || []);
  const [priorities, setPriorities] = useState<string[]>(profile?.priorities || []);
  const [noise, setNoise] = useState<string[]>(profile?.noise || []);
  const [profileSaveState, setProfileSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced profile save
  useEffect(() => {
    // Skip first run
    if (profileSaveState === "idle" && bio === (profile?.bio || "") &&
        JSON.stringify(interests) === JSON.stringify(profile?.interests || []) &&
        JSON.stringify(priorities) === JSON.stringify(profile?.priorities || []) &&
        JSON.stringify(noise) === JSON.stringify(profile?.noise || [])) return;

    if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
    setProfileSaveState("saving");
    profileSaveTimer.current = setTimeout(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("user_profile").upsert({
        user_id: user.id,
        bio, interests, priorities, noise,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      setProfileSaveState("saved");
      setTimeout(() => setProfileSaveState("idle"), 1500);
    }, 700);

    return () => { if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bio, interests, priorities, noise]);

  // ===== Voice state =====
  const [voiceProfile, setVoiceProfile] = useState(profile?.voice_profile || "");
  const [voiceLearnedAt, setVoiceLearnedAt] = useState(profile?.voice_learned_at || null);
  const [learningVoice, setLearningVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const handleLearnVoice = async () => {
    if (learningVoice) return;
    setLearningVoice(true);
    setVoiceError(null);
    try {
      const res = await fetch("/api/voice/learn", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setVoiceProfile(data.voice || "");
        setVoiceLearnedAt(new Date().toISOString());
      } else setVoiceError(data.error || "Failed to learn voice");
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : "Network error");
    } finally { setLearningVoice(false); }
  };

  // ===== Memory state =====
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [newMemoryKind, setNewMemoryKind] = useState<MemoryKind>("context");
  const [newMemorySubject, setNewMemorySubject] = useState("");
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [addingMemory, setAddingMemory] = useState(false);
  const [showAddMemory, setShowAddMemory] = useState(false);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingMemory || !newMemorySubject.trim() || !newMemoryContent.trim()) return;
    setAddingMemory(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: newMemoryKind,
          subject: newMemorySubject,
          content: newMemoryContent,
        }),
      });
      const data = await res.json();
      if (res.ok && data.memory) {
        setMemories((prev) => [data.memory, ...prev]);
        setNewMemorySubject(""); setNewMemoryContent("");
        setShowAddMemory(false);
      }
    } finally { setAddingMemory(false); }
  };

  const handleDeleteMemory = async (id: string) => {
    await fetch(`/api/memory/${id}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleTogglePin = async (id: string, pinned: boolean) => {
    setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: !pinned } : m)));
    await fetch(`/api/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
  };

  // ===== Briefing / Digest state =====
  const [digestEnabled, setDigestEnabled] = useState(syncState?.digest_enabled ?? true);
  const [digestHour, setDigestHour] = useState(syncState?.digest_hour_utc ?? 13);
  const [sendingTestDigest, setSendingTestDigest] = useState(false);
  const [testDigestResult, setTestDigestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSaveDigest = async (nextEnabled: boolean, nextHour: number) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_sync_state").update({
      digest_enabled: nextEnabled,
      digest_hour_utc: nextHour,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
  };

  const handleToggleDigest = async () => {
    const next = !digestEnabled;
    setDigestEnabled(next);
    handleSaveDigest(next, digestHour);
  };

  const handleHourChange = async (hour: number) => {
    setDigestHour(hour);
    handleSaveDigest(digestEnabled, hour);
  };

  const sendTestDigest = async () => {
    if (sendingTestDigest) return;
    setSendingTestDigest(true);
    setTestDigestResult(null);
    try {
      const res = await fetch("/api/cron/daily-digest", { method: "POST" });
      const data = await res.json();
      if (res.ok) setTestDigestResult({ ok: true, message: "Digest sent — check your inbox." });
      else setTestDigestResult({ ok: false, message: data.error || "Failed to send" });
    } catch (e) {
      setTestDigestResult({ ok: false, message: e instanceof Error ? e.message : "Network error" });
    } finally { setSendingTestDigest(false); }
  };

  // ===== Mutes state =====
  const [mutes, setMutes] = useState(initialMutes);

  const handleRemoveMute = async (muteId: string) => {
    await fetch(`/api/mute?id=${muteId}`, { method: "DELETE" });
    setMutes((prev) => prev.filter((m) => m.id !== muteId));
  };

  // ===== Account state =====
  const [exporting, setExporting] = useState(false);
  const handleExport = () => {
    setExporting(true);
    window.location.href = "/api/account/export";
    setTimeout(() => setExporting(false), 2500);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete");
        setDeleting(false);
        return;
      }
      window.location.href = "/";
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Network error");
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const sections: Array<{ key: SettingsSection; label: string; icon: React.ReactNode; description: string }> = [
    { key: "profile", label: "Profile", icon: <User className="w-3.5 h-3.5" />, description: "Who you are and what you care about" },
    { key: "appearance", label: "Appearance", icon: <Palette className="w-3.5 h-3.5" />, description: "How Oushi looks and reads" },
    { key: "voice", label: "Voice", icon: <Sparkles className="w-3.5 h-3.5" />, description: "How Oushi writes as you" },
    { key: "memory", label: "Memory", icon: <BrainCircuit className="w-3.5 h-3.5" />, description: "What Oushi remembers" },
    { key: "briefing", label: "Daily briefing", icon: <Bell className="w-3.5 h-3.5" />, description: "Morning digest settings" },
    { key: "notifications", label: "Push notifications", icon: <BellRing className="w-3.5 h-3.5" />, description: "Nudges so you don't forget" },
    { key: "labels", label: "Gmail labels", icon: <Tag className="w-3.5 h-3.5" />, description: "Auto-organize your Gmail" },
    { key: "filters", label: "Filters", icon: <VolumeX className="w-3.5 h-3.5" />, description: "Muted senders & domains" },
    { key: "account", label: "Account & data", icon: <Mail className="w-3.5 h-3.5" />, description: "Gmail, exports, delete" },
  ];

  const currentSection = sections.find((s) => s.key === section);

  return (
    <div
      className="h-screen text-[#2A2520] overflow-hidden flex relative"
      style={{
        background: `
          radial-gradient(ellipse at 20% -10%, #FBF4DF 0%, transparent 55%),
          radial-gradient(ellipse at 90% 100%, #F5E8D2 0%, transparent 60%),
          #FAF6EB
        `,
      }}
    >
      <AmbientBackground variant="subtle" />
      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-[#2A2520]/30 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait" initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={isMobile ? { x: -260 } : { width: 0, opacity: 0 }}
            animate={isMobile ? { x: 0 } : { width: 260, opacity: 1 }}
            exit={isMobile ? { x: -260 } : { width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className={`shrink-0 h-full flex flex-col border-r border-[#E6DCC4] overflow-hidden relative z-10 ${
              isMobile ? "fixed z-40 w-[260px] shadow-2xl" : ""
            }`}
            style={
              isMobile
                ? {
                    background:
                      "linear-gradient(180deg, #FFFCF3 0%, #FBF6E9 100%)",
                  }
                : {
                    width: 260,
                    background:
                      "linear-gradient(180deg, #FFFCF3 0%, #FBF6E9 100%)",
                  }
            }
          >
            {/* Brand block — serif wordmark to match dashboard */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 group"
              >
                <OushiMark size={26} />
                <span
                  className="text-[19px] tracking-[-0.012em] text-[#2A2520] group-hover:text-[#B86B4A] transition-colors font-medium"
                  style={{
                    fontFamily: "var(--font-source-serif), Georgia, serif",
                  }}
                >
                  Oushi
                </span>
              </Link>
            </div>

            {/* Soft gradient divider */}
            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-[#E6DCC4] to-transparent" />

            {/* Settings header + back link */}
            <div className="px-5 py-4">
              <p
                className="text-[11px] italic text-[#A89F92] mb-1"
                style={{
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                }}
              >
                Settings
              </p>
              <p
                className="text-[14.5px] text-[#2A2520] truncate"
                style={{
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                }}
              >
                {userEmail}
              </p>
              <Link
                href="/dashboard"
                className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#766E63] hover:text-[#B86B4A] transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                Back to inbox
              </Link>
            </div>

            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-[#E6DCC4] to-transparent" />

            <nav className="flex-1 overflow-y-auto px-3 py-3">
              {sections.map((s) => (
                <SettingsNavItem
                  key={s.key}
                  icon={s.icon}
                  label={s.label}
                  description={s.description}
                  active={section === s.key}
                  onClick={() => pickSection(s.key)}
                />
              ))}
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 h-full overflow-y-auto relative z-10">
        {/* Mobile top bar */}
        {isMobile && (
          <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-[#E6DCC4] bg-[#FAF6EB]/95 backdrop-blur">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 border border-[#E6DCC4] bg-[#FFFCF3] text-[#766E63] hover:text-[#2A2520]"
            >
              <Menu className="w-4 h-4" />
            </button>
            <p className="text-[14px] font-semibold text-[#2A2520]">{currentSection?.label || "Settings"}</p>
          </div>
        )}
        <div className="max-w-[680px] mx-auto px-5 sm:px-10 lg:px-14 py-10 sm:py-16">
          {section === "profile" && (
            <ProfileSection
              bio={bio} setBio={setBio}
              interests={interests} setInterests={setInterests}
              priorities={priorities} setPriorities={setPriorities}
              noise={noise} setNoise={setNoise}
              saveState={profileSaveState}
            />
          )}

          {section === "appearance" && <AppearanceSection />}

          {section === "voice" && (
            <VoiceSection
              voiceProfile={voiceProfile}
              voiceLearnedAt={voiceLearnedAt}
              learningVoice={learningVoice}
              voiceError={voiceError}
              hasGmail={hasGmail}
              onLearn={handleLearnVoice}
            />
          )}

          {section === "memory" && (
            <MemorySection
              memories={memories}
              showAdd={showAddMemory}
              setShowAdd={setShowAddMemory}
              kind={newMemoryKind} setKind={setNewMemoryKind}
              subject={newMemorySubject} setSubject={setNewMemorySubject}
              content={newMemoryContent} setContent={setNewMemoryContent}
              adding={addingMemory}
              onAdd={handleAddMemory}
              onDelete={handleDeleteMemory}
              onTogglePin={handleTogglePin}
            />
          )}

          {section === "briefing" && (
            <BriefingSection
              enabled={digestEnabled}
              hour={digestHour}
              onToggle={handleToggleDigest}
              onHourChange={handleHourChange}
              lastSentAt={syncState?.last_digest_sent_at || null}
              onTest={sendTestDigest}
              testing={sendingTestDigest}
              testResult={testDigestResult}
              hasGmail={hasGmail}
            />
          )}

          {section === "notifications" && <NotificationsSection />}

          {section === "labels" && <LabelsSection />}

          {section === "filters" && (
            <FiltersSection mutes={mutes} onRemove={handleRemoveMute} />
          )}

          {section === "account" && (
            <AccountSection
              userEmail={userEmail}
              hasGmail={hasGmail}
              exporting={exporting}
              onExport={handleExport}
              onSignOut={handleSignOut}
              showDeleteConfirm={showDeleteConfirm}
              setShowDeleteConfirm={setShowDeleteConfirm}
              deleteConfirmText={deleteConfirmText}
              setDeleteConfirmText={setDeleteConfirmText}
              deleting={deleting}
              deleteError={deleteError}
              onDelete={handleDelete}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ===== COMPONENTS =====

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-9">
      <h1
        className="text-[32px] tracking-[-0.018em] text-[#2A2520] leading-[1.1]"
        style={{
          fontFamily: "var(--font-source-serif), Georgia, serif",
        }}
      >
        {title}
      </h1>
      <p className="mt-2.5 text-[14.5px] text-[#766E63] leading-relaxed max-w-[480px]">
        {description}
      </p>
    </div>
  );
}

/**
 * Settings sidebar nav item with a sliding active pill (shared layoutId
 * "settings-active-pill" makes it slide between rows via framer-motion).
 */
function SettingsNavItem({
  icon,
  label,
  description,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative w-full flex items-start gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-left transition-colors ${
        active
          ? "text-[#2A2520]"
          : "text-[#766E63] hover:text-[#3F362C]"
      }`}
    >
      {active && (
        <motion.div
          layoutId="settings-active-pill"
          className="absolute inset-0 rounded-lg bg-[#FBF4DF]"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 3px rgba(106,76,38,0.06)",
          }}
          transition={{ type: "spring", stiffness: 480, damping: 36 }}
        />
      )}
      {!active && (
        <span className="absolute inset-0 rounded-lg bg-[#FAF6EB]/0 group-hover:bg-[#FAF6EB] transition-colors" />
      )}
      <span
        className={`relative mt-0.5 transition-colors ${
          active ? "text-[#B86B4A]" : "text-[#A89F92] group-hover:text-[#766E63]"
        }`}
      >
        {icon}
      </span>
      <div className="relative min-w-0 flex-1">
        <p
          className={`text-[13.5px] leading-tight ${active ? "font-medium text-[#2A2520]" : ""}`}
        >
          {label}
        </p>
        <p className="text-[11px] text-[#A89F92] mt-0.5 leading-snug truncate">
          {description}
        </p>
      </div>
    </button>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[#E6DCC4]/80 bg-[#FFFCF3] overflow-hidden ${className}`}
      style={{
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 24px -10px rgba(106,76,38,0.08), 0 1px 3px rgba(106,76,38,0.04)",
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#2A2520]">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-[#766E63]">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function StackedField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <label className="block text-[12px] font-medium text-[#2A2520] mb-2">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-[#A89F92]">{hint}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[#5E8FBF]" : "bg-[#E6DCC4]"
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null;
  return (
    <div className="inline-flex items-center gap-1 text-[11px] text-[#766E63]">
      {state === "saving" && (
        <>
          <div className="w-2 h-2 rounded-full bg-[#5E8FBF] animate-pulse" />
          Saving
        </>
      )}
      {state === "saved" && (
        <>
          <Check className="w-3 h-3 text-[#6B8E68]" />
          <span className="text-[#6B8E68]">Saved</span>
        </>
      )}
    </div>
  );
}

// ===== TAG INPUT =====

function TagInput({
  value,
  onChange,
  placeholder,
  accent = "sky",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  accent?: "sky" | "sage" | "muted";
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tagColors = {
    sky: { bg: "bg-[#D0E1F0]/50", text: "text-[#3D6A95]", border: "border-[#5E8FBF]/20", hover: "hover:bg-[#D0E1F0]" },
    sage: { bg: "bg-[#E8EFE5]", text: "text-[#6B8E68]", border: "border-[#6B8E68]/20", hover: "hover:bg-[#E8EFE5]/80" },
    muted: { bg: "bg-[#F0E9D6]", text: "text-[#766E63]", border: "border-[#E6DCC4]", hover: "hover:bg-[#F0E9D6]/80" },
  }[accent];

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="rounded-md border border-[#E6DCC4] bg-[#FAF6EB]/40 px-2 py-1.5 min-h-[36px] flex flex-wrap items-center gap-1.5 cursor-text focus-within:border-[#5E8FBF] focus-within:bg-[#FFFCF3] focus-within:ring-2 focus-within:ring-[#5E8FBF]/15 transition-all"
    >
      {value.map((tag) => (
        <span
          key={tag}
          className={`group inline-flex items-center gap-1 rounded-md border ${tagColors.border} ${tagColors.bg} ${tagColors.text} px-2 py-0.5 text-[12px] font-medium ${tagColors.hover} transition-colors`}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(value.filter((t) => t !== tag)); }}
            className="opacity-50 hover:opacity-100"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => addTag(input)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent text-[13px] text-[#2A2520] outline-none py-0.5 px-1 placeholder:text-[#A89F92]"
      />
    </div>
  );
}

// ===== PROFILE SECTION =====

function ProfileSection({
  bio, setBio,
  interests, setInterests,
  priorities, setPriorities,
  noise, setNoise,
  saveState,
}: {
  bio: string; setBio: (v: string) => void;
  interests: string[]; setInterests: (v: string[]) => void;
  priorities: string[]; setPriorities: (v: string[]) => void;
  noise: string[]; setNoise: (v: string[]) => void;
  saveState: "idle" | "saving" | "saved";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-[26px] font-semibold tracking-tight text-[#2A2520]">Profile</h1>
        <SaveBadge state={saveState} />
      </div>
      <p className="text-[14px] text-[#766E63] mb-8">
        Who you are. The richer this gets, the sharper Oushi&apos;s rankings.
      </p>

      <Card>
        <StackedField
          label="Bio"
          hint="A few sentences about who you are and what you're working on."
        >
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="e.g. Founder building Oushi, an AI email assistant. Based in NYC. Interested in design and AI."
            className="w-full rounded-md border border-[#E6DCC4] bg-[#FAF6EB]/40 px-3 py-2 text-[13px] text-[#2A2520] focus:outline-none focus:border-[#5E8FBF] focus:ring-2 focus:ring-[#5E8FBF]/15 resize-y"
          />
        </StackedField>
        <div className="border-t border-[#E6DCC4]" />
        <StackedField label="Interests" hint="Subjects you want to keep an eye on. Press Enter to add.">
          <TagInput value={interests} onChange={setInterests} placeholder="e.g. engineering, AI, design" accent="sage" />
        </StackedField>
        <div className="border-t border-[#E6DCC4]" />
        <StackedField label="Priorities" hint="What you always care about — Oushi will rank these higher.">
          <TagInput value={priorities} onChange={setPriorities} placeholder="e.g. job offers, interview requests, my advisor" accent="sky" />
        </StackedField>
        <div className="border-t border-[#E6DCC4]" />
        <StackedField label="Noise" hint="What you'd rather not see — Oushi will down-rank these.">
          <TagInput value={noise} onChange={setNoise} placeholder="e.g. crypto pitches, LinkedIn spam, recruiter mail" accent="muted" />
        </StackedField>
      </Card>
    </div>
  );
}

// ===== APPEARANCE SECTION =====

function AppearanceSection() {
  const [mode, setMode] = useState<TodayMode>("narrative");

  useEffect(() => {
    setMode(readStoredTodayMode());
  }, []);

  const changeMode = (m: TodayMode) => {
    setMode(m);
    writeStoredTodayMode(m);
    // Custom in-tab event so the dashboard reflects the change without
    // a page reload. Storage events only fire across tabs.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("oushi:todayMode", { detail: { mode: m } })
      );
    }
  };

  return (
    <div>
      <SectionHeader
        title="Appearance"
        description="Choose how the Today view reads — a morning brief in prose, or the classic card list."
      />

      <Card>
        <div className="p-5">
          <div className="flex items-start justify-between gap-6 mb-5">
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium text-[#2A2520] mb-1">
                Today view
              </p>
              <p className="text-[12px] text-[#766E63] leading-relaxed">
                Narrative is the new default — Oushi writes you a short brief
                with email cards woven in. Classic is the original card list
                if you prefer the denser triage layout.
              </p>
            </div>
            <TodayModeToggle mode={mode} onChange={changeMode} size="md" />
          </div>

          {/* Preview tiles — quick glance at what each mode feels like */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AppearancePreview
              label="Narrative"
              active={mode === "narrative"}
              onClick={() => changeMode("narrative")}
              accent="#B86B4A"
            >
              <p
                className="font-serif text-[14px] italic text-[#3F362C] leading-snug mb-1.5"
                style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
              >
                Three things matter today.
              </p>
              <div className="h-1.5 rounded-full bg-[#E6DCC4] mb-1.5 w-3/4" />
              <div className="h-7 rounded-md bg-[#FAF6EB] border border-[#E6DCC4]" />
              <div className="h-7 rounded-md bg-[#FAF6EB] border border-[#E6DCC4] mt-1.5" />
            </AppearancePreview>

            <AppearancePreview
              label="Classic"
              active={mode === "classic"}
              onClick={() => changeMode("classic")}
              accent="#5E8FBF"
            >
              <p className="text-[12.5px] font-semibold text-[#2A2520] mb-1.5">
                Today
              </p>
              <div className="space-y-1">
                <div className="h-4 rounded bg-[#FAF6EB] border border-[#E6DCC4]" />
                <div className="h-4 rounded bg-[#FAF6EB] border border-[#E6DCC4]" />
                <div className="h-4 rounded bg-[#FAF6EB] border border-[#E6DCC4]" />
                <div className="h-4 rounded bg-[#FAF6EB] border border-[#E6DCC4]" />
              </div>
            </AppearancePreview>
          </div>
        </div>
      </Card>

      <p className="mt-3 text-[11.5px] text-[#A89F92] italic leading-relaxed">
        More appearance options — dark mode, density, time-aware warmth shift —
        coming soon.
      </p>
    </div>
  );
}

function AppearancePreview({
  label,
  active,
  onClick,
  accent,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-3 border transition-all ${
        active
          ? "bg-[#FFFCF3] border-transparent"
          : "bg-[#FFFCF3]/50 border-[#E6DCC4]/80 hover:bg-[#FFFCF3]"
      }`}
      style={{
        boxShadow: active
          ? `0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 28px -10px rgba(106,76,38,0.14), 0 0 0 1.5px ${accent}`
          : "0 1px 0 rgba(255,255,255,0.5) inset, 0 2px 8px -4px rgba(106,76,38,0.06)",
      }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#766E63]">
          {label}
        </p>
        {active && (
          <span className="ml-auto text-[9.5px] font-mono uppercase tracking-wider text-[#6B8E68]">
            Active
          </span>
        )}
      </div>
      <div>{children}</div>
    </button>
  );
}

// ===== VOICE SECTION =====

function VoiceSection({
  voiceProfile,
  voiceLearnedAt,
  learningVoice,
  voiceError,
  hasGmail,
  onLearn,
}: {
  voiceProfile: string;
  voiceLearnedAt: string | null;
  learningVoice: boolean;
  voiceError: string | null;
  hasGmail: boolean;
  onLearn: () => void;
}) {
  return (
    <div>
      <SectionHeader title="Voice" description="Teach Oushi how you write so drafted replies sound like you." />

      {voiceProfile ? (
        <>
          <Card>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-[#5E8FBF]" />
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#5E8FBF]">
                  Your writing voice
                </p>
              </div>
              <p className="text-[14px] leading-[1.65] text-[#2A2520]">{voiceProfile}</p>
              {voiceLearnedAt && (
                <p className="mt-4 text-[11px] text-[#A89F92]">
                  Learned {new Date(voiceLearnedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          </Card>
          <button
            onClick={onLearn}
            disabled={learningVoice || !hasGmail}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] px-3 py-1.5 text-[12px] font-medium text-[#766E63] hover:text-[#3D6A95] hover:border-[#5E8FBF]/40 transition-colors disabled:opacity-40"
          >
            {learningVoice ? <><RefreshCw className="w-3 h-3 animate-spin" />Re-learning</> : <><RefreshCw className="w-3 h-3" />Re-learn from sent emails</>}
          </button>
        </>
      ) : (
        <Card>
          <div className="p-8 text-center">
            <div className="w-10 h-10 mx-auto rounded-lg bg-[#D0E1F0] flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4 text-[#3D6A95]" />
            </div>
            <p className="text-[15px] font-medium text-[#2A2520]">No voice learned yet</p>
            <p className="mt-1 text-[13px] text-[#766E63] max-w-sm mx-auto">
              Oushi will read your recent sent emails to learn how you write. Drafts will sound like you instead of generic AI.
            </p>
            <button
              onClick={onLearn}
              disabled={learningVoice || !hasGmail}
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-[#5E8FBF] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4A7AAB] transition-colors disabled:opacity-40"
            >
              {learningVoice ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Learning…</> : <><Sparkles className="w-3.5 h-3.5" />Learn my voice</>}
            </button>
          </div>
        </Card>
      )}

      <AnimatePresence>
        {voiceError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-md border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-3 py-2 text-[12px] text-[#B86B4A] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {voiceError}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===== MEMORY SECTION =====

function MemorySection({
  memories,
  showAdd, setShowAdd,
  kind, setKind,
  subject, setSubject,
  content, setContent,
  adding,
  onAdd,
  onDelete,
  onTogglePin,
}: {
  memories: Memory[];
  showAdd: boolean; setShowAdd: (v: boolean) => void;
  kind: MemoryKind; setKind: (k: MemoryKind) => void;
  subject: string; setSubject: (s: string) => void;
  content: string; setContent: (c: string) => void;
  adding: boolean;
  onAdd: (e: React.FormEvent) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-[26px] font-semibold tracking-tight text-[#2A2520]">Memory</h1>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 rounded-md bg-[#5E8FBF] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#4A7AAB] transition-colors"
          >
            <Plus className="w-3 h-3" />
            New memory
          </button>
        )}
      </div>
      <p className="text-[14px] text-[#766E63] mb-8">
        Facts Oushi has learned about you across your inbox. Used in every reply, briefing, and answer.
      </p>

      <AnimatePresence>
        {showAdd && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={onAdd}
            className="overflow-hidden mb-6"
          >
            <Card>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-[#2A2520] block mb-1">Kind</label>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as MemoryKind)}
                      className="w-full rounded-md border border-[#E6DCC4] bg-[#FAF6EB]/40 px-2.5 py-1.5 text-[13px] text-[#2A2520] focus:outline-none focus:border-[#5E8FBF] focus:ring-2 focus:ring-[#5E8FBF]/15"
                    >
                      {(Object.keys(KIND_LABELS) as MemoryKind[]).map((k) => (
                        <option key={k} value={k}>{KIND_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#2A2520] block mb-1">Subject</label>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Maya Chen"
                      maxLength={80}
                      className="w-full rounded-md border border-[#E6DCC4] bg-[#FAF6EB]/40 px-2.5 py-1.5 text-[13px] text-[#2A2520] focus:outline-none focus:border-[#5E8FBF] focus:ring-2 focus:ring-[#5E8FBF]/15"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#2A2520] block mb-1">What to remember</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={2}
                    maxLength={400}
                    placeholder="One sentence Oushi should always remember."
                    className="w-full rounded-md border border-[#E6DCC4] bg-[#FAF6EB]/40 px-2.5 py-1.5 text-[13px] text-[#2A2520] focus:outline-none focus:border-[#5E8FBF] focus:ring-2 focus:ring-[#5E8FBF]/15 resize-y"
                  />
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowAdd(false); setSubject(""); setContent(""); }}
                    className="text-[12px] text-[#766E63] hover:text-[#2A2520] px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding || !subject.trim() || !content.trim()}
                    className="rounded-md bg-[#5E8FBF] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#4A7AAB] disabled:opacity-40 transition-colors"
                  >
                    {adding ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </Card>
          </motion.form>
        )}
      </AnimatePresence>

      {memories.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <BrainCircuit className="w-8 h-8 mx-auto text-[#A89F92] mb-3" />
            <p className="text-[14px] font-medium text-[#2A2520]">Nothing remembered yet</p>
            <p className="mt-1 text-[12px] text-[#766E63] max-w-sm mx-auto">
              Memories build up automatically as Oushi reads your inbox. You can also add some manually.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {(Object.keys(KIND_LABELS) as MemoryKind[]).map((k) => {
            const items = memories.filter((m) => m.kind === k);
            if (items.length === 0) return null;
            return (
              <div key={k}>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2 px-1">
                  {KIND_LABELS[k]} · {items.length}
                </p>
                <Card>
                  <div className="divide-y divide-[#E6DCC4]/60">
                    {items.map((m) => (
                      <div
                        key={m.id}
                        className={`group flex items-start gap-3 px-4 py-3 ${m.pinned ? "bg-[#D0E1F0]/15" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-[#2A2520] truncate">{m.subject}</p>
                          <p className="text-[12px] text-[#766E63] leading-snug mt-0.5">{m.content}</p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => onTogglePin(m.id, m.pinned)}
                            title={m.pinned ? "Unpin" : "Pin"}
                            className={`rounded p-1 ${m.pinned ? "text-[#5E8FBF]" : "text-[#A89F92] hover:text-[#2A2520]"}`}
                          >
                            <Pin className={`w-3 h-3 ${m.pinned ? "fill-[#5E8FBF]" : ""}`} />
                          </button>
                          <button
                            onClick={() => onDelete(m.id)}
                            title="Forget"
                            className="rounded p-1 text-[#A89F92] hover:text-[#B86B4A]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== BRIEFING SECTION =====

function BriefingSection({
  enabled,
  hour,
  onToggle,
  onHourChange,
  lastSentAt,
  onTest,
  testing,
  testResult,
  hasGmail,
}: {
  enabled: boolean;
  hour: number;
  onToggle: () => void;
  onHourChange: (h: number) => void;
  lastSentAt: string | null;
  onTest: () => void;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  hasGmail: boolean;
}) {
  const localPreview = (() => {
    const d = new Date();
    d.setUTCHours(hour, 0, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  })();

  const formatHour = (h: number): string => {
    const ampm = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
    return ampm;
  };

  return (
    <div>
      <SectionHeader
        title="Daily briefing"
        description="A short morning email summarizing what matters in your inbox."
      />

      <Card>
        <Row label="Receive daily briefing" hint={enabled ? `Sent at ${formatHour(hour)} UTC each day` : "Currently off"}>
          <Toggle checked={enabled} onChange={onToggle} />
        </Row>

        {enabled && (
          <>
            <div className="border-t border-[#E6DCC4]" />
            <StackedField label="Delivery time (UTC)" hint={`= ${localPreview} in your local timezone today`}>
              <select
                value={hour}
                onChange={(e) => onHourChange(parseInt(e.target.value, 10))}
                className="w-full rounded-md border border-[#E6DCC4] bg-[#FAF6EB]/40 px-3 py-2 text-[13px] text-[#2A2520] focus:outline-none focus:border-[#5E8FBF] focus:ring-2 focus:ring-[#5E8FBF]/15"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>{formatHour(h)} UTC</option>
                ))}
              </select>
            </StackedField>
            <div className="border-t border-[#E6DCC4]" />
            <Row
              label="Test it"
              hint={lastSentAt ? `Last sent ${new Date(lastSentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Send a digest right now to see what it looks like"}
            >
              <button
                onClick={onTest}
                disabled={testing || !hasGmail}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#5E8FBF]/30 bg-[#D0E1F0]/30 px-3 py-1.5 text-[12px] font-medium text-[#3D6A95] hover:bg-[#D0E1F0]/60 disabled:opacity-40 transition-colors"
              >
                {testing ? (
                  <><RefreshCw className="w-3 h-3 animate-spin" />Sending</>
                ) : (
                  <><Send className="w-3 h-3" />Send now</>
                )}
              </button>
            </Row>
          </>
        )}
      </Card>

      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={`mt-4 rounded-md border px-3 py-2 text-[12px] ${testResult.ok ? "border-[#6B8E68]/30 bg-[#E8EFE5]/40 text-[#6B8E68]" : "border-[#B86B4A]/30 bg-[#F5E8E0]/40 text-[#B86B4A]"}`}>
              {testResult.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===== NOTIFICATIONS SECTION =====

function NotificationsSection() {
  const [permission, setPermission] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testStatus, setTestStatus] = useState<null | { ok: boolean; message: string }>(null);
  const [enableError, setEnableError] = useState<null | { reason: string; detail?: string }>(null);

  // Load support + current state on mount
  useEffect(() => {
    (async () => {
      const { getPushSupport, getActiveSubscription } = await import("@/lib/push-client");
      const p = getPushSupport();
      setPermission(p);
      const sub = await getActiveSubscription();
      setSubscribed(!!sub);
    })();
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    setTestStatus(null);
    setEnableError(null);
    try {
      const { enablePush } = await import("@/lib/push-client");
      const result = await enablePush();
      if (result.ok) {
        setSubscribed(true);
        setPermission("granted");
      } else {
        setEnableError({ reason: result.reason, detail: result.detail });
        // Sync permission state in case it changed
        if (typeof Notification !== "undefined") {
          setPermission(Notification.permission as "default" | "granted" | "denied");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setTestStatus(null);
    try {
      const { disablePush } = await import("@/lib/push-client");
      await disablePush();
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setTestStatus(null);
    try {
      const { sendTestPush } = await import("@/lib/push-client");
      const r = await sendTestPush();
      if (r.delivered > 0) {
        setTestStatus({ ok: true, message: `Sent to ${r.delivered} device${r.delivered === 1 ? "" : "s"}.` });
      } else if (r.pruned > 0) {
        setTestStatus({ ok: false, message: "Your subscription was stale — try Re-enable." });
        setSubscribed(false);
      } else {
        setTestStatus({ ok: false, message: "Couldn't deliver. Server may be missing VAPID keys." });
      }
    } catch {
      setTestStatus({ ok: false, message: "Network error." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Push notifications"
        description="Oushi nudges you only when something matters: an overdue promise, a thread you opened and forgot to reply to. Quiet by default."
      />

      {permission === "unsupported" && (
        <div className="rounded-lg border border-[#E6DCC4] bg-[#FAF6EB]/40 px-4 py-3 text-[12.5px] text-[#766E63]">
          This browser doesn&apos;t support push notifications. Try Chrome, Edge, or Safari 16.4+.
        </div>
      )}

      {permission === "denied" && (
        <div className="rounded-lg border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-4 py-3 text-[12.5px] text-[#B86B4A]">
          You blocked notifications for this site. Re-enable them in your browser settings (next to the URL bar) and reload.
        </div>
      )}

      {permission !== "unsupported" && permission !== "denied" && (
        <div className="space-y-3">
          {enableError && (
            <div className="rounded-lg border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-4 py-3 text-[12.5px] text-[#B86B4A]">
              <p className="font-medium">{enableError.reason}</p>
              {enableError.detail && (
                <p className="mt-1 text-[11.5px] opacity-80 break-words">{enableError.detail}</p>
              )}
            </div>
          )}
          <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  subscribed ? "bg-[#E8EFE5]" : "bg-[#FAF6EB]"
                }`}
              >
                <BellRing className={`w-4 h-4 ${subscribed ? "text-[#6B8E68]" : "text-[#A89F92]"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#2A2520]">
                  {subscribed ? "Notifications are on" : "Notifications are off"}
                </p>
                <p className="text-[11.5px] text-[#766E63] truncate">
                  {subscribed
                    ? "Oushi will ping this device when something matters."
                    : "Turn on to get nudges for overdue promises and stale replies."}
                </p>
              </div>
            </div>
            {subscribed ? (
              <button
                onClick={handleDisable}
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E6DCC4] text-[12px] text-[#766E63] hover:text-[#B86B4A] hover:border-[#B86B4A]/40 transition-colors disabled:opacity-60"
              >
                Turn off
              </button>
            ) : (
              <button
                onClick={handleEnable}
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#5E8FBF] hover:bg-[#3D6A95] text-white text-[12px] font-medium shadow-sm transition-colors disabled:opacity-60"
              >
                <BellRing className="w-3 h-3" />
                Turn on
              </button>
            )}
          </div>

          {subscribed && (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleTest}
                disabled={busy}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] text-[12px] text-[#2A2520] hover:border-[#5E8FBF] hover:text-[#3D6A95] transition-colors disabled:opacity-60"
              >
                <Send className="w-3 h-3" />
                Send test notification
              </button>
              {testStatus && (
                <p
                  className={`text-[11.5px] ${
                    testStatus.ok ? "text-[#6B8E68]" : "text-[#B86B4A]"
                  }`}
                >
                  {testStatus.message}
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-[#D0E1F0] bg-[#D0E1F0]/20 px-4 py-3 text-[11.5px] text-[#3D6A95] leading-relaxed">
            <strong className="text-[#2A2520]">What you&apos;ll get:</strong> a ping when a promise you made is overdue,
            when an email you opened has been sitting unanswered for 2+ days, and a short morning brief.
            <strong className="text-[#2A2520]"> What you won&apos;t get:</strong> newsletters, marketing, or routine emails.
            Quiet by default.
          </div>
        </div>
      )}
    </div>
  );
}

// ===== GMAIL LABELS SECTION =====

const LABEL_PALETTE = [
  { name: "Respond", color: "#cc3a21", text: "#fff" },
  { name: "Awaiting reply", color: "#eaa041", text: "#fff" },
  { name: "Follow up", color: "#3c78d8", text: "#fff" },
  { name: "Meeting", color: "#8e63ce", text: "#fff" },
  { name: "Receipt", color: "#149e60", text: "#fff" },
  { name: "FYI", color: "#cccccc", text: "#000" },
  { name: "Marketing", color: "#fbc8d9", text: "#000" },
];

interface ApplyProgress {
  phase:
    | "ensuring_labels"
    | "fetching"
    | "fetched"
    | "llm_classifying"
    | "classifying"
    | "applying"
    | "applied"
    | "stamping";
  count?: number;
  group?: string;
  appliedSoFar?: number;
  totalToApply?: number;
}

const WINDOW_OPTIONS = [14, 30, 60] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

function LabelsSection() {
  const [busy, setBusy] = useState<null | "apply" | "reset">(null);
  const [result, setResult] = useState<null | {
    scanned: number;
    applied: number;
    breakdown: Record<string, number>;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [progress, setProgress] = useState<ApplyProgress | null>(null);
  const [windowDays, setWindowDays] = useState<WindowDays>(30);

  const phaseLabel = (p: ApplyProgress): string => {
    switch (p.phase) {
      case "ensuring_labels":
        return "Creating Gmail labels…";
      case "fetching":
        return `Scanning your last ${windowDays} days…`;
      case "fetched":
        return `Found ${p.count} emails — classifying…`;
      case "llm_classifying":
        return `Reading ${p.count} ambiguous emails with Claude…`;
      case "classifying":
        return "Classifying…";
      case "applying":
        return p.group && p.group !== "__none__"
          ? `Labeling ${p.group} (${p.count})…`
          : "Clearing unlabeled…";
      case "applied":
        return p.group && p.group !== "__none__"
          ? `Labeled ${p.appliedSoFar}/${p.totalToApply}…`
          : `Labeled ${p.appliedSoFar}/${p.totalToApply}…`;
      case "stamping":
        return "Finalizing…";
      default:
        return "Working…";
    }
  };

  const progressPct = (p: ApplyProgress | null): number => {
    if (!p) return 0;
    if (p.phase === "ensuring_labels") return 5;
    if (p.phase === "fetching") return 10;
    if (p.phase === "fetched") return 15;
    if (p.phase === "llm_classifying") return 22;
    if (p.phase === "classifying") return 28;
    if (p.phase === "stamping") return 98;
    if (p.totalToApply && p.appliedSoFar !== undefined) {
      return 30 + Math.floor(65 * (p.appliedSoFar / Math.max(1, p.totalToApply)));
    }
    return 30;
  };

  const apply = async () => {
    setBusy("apply");
    setError(null);
    setResult(null);
    setProgress({ phase: "ensuring_labels" });
    try {
      const res = await fetch("/api/labels/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: windowDays }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't apply labels");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const event = JSON.parse(line);
            if (event.phase === "error") {
              setError(event.message || "Apply failed");
            } else if (event.phase === "done") {
              setResult({
                scanned: event.scanned || 0,
                applied: event.applied || 0,
                breakdown: event.breakdown || {},
              });
            } else {
              setProgress(event);
            }
          } catch {
            // Ignore malformed lines
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    setError(null);
    setResult(null);
    setConfirmingReset(false);
    try {
      const res = await fetch("/api/labels/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed");
      } else {
        setResult({ scanned: 0, applied: 0, breakdown: {} });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  // Load the user's persisted window choice so the selector reflects
  // what's currently configured (and what the rank self-heal is using).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("user_sync_state")
          .select("gmail_labels_window_days")
          .eq("user_id", user.id)
          .maybeSingle();
        const stored = data?.gmail_labels_window_days;
        if (!cancelled && stored && WINDOW_OPTIONS.includes(stored as WindowDays)) {
          setWindowDays(stored as WindowDays);
        }
      } catch {
        // Default of 30 stays
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const windowLabel =
    windowDays === 14 ? "2 weeks" : windowDays === 30 ? "month" : "2 months";

  return (
    <div>
      <SectionHeader
        title="Gmail labels"
        description="Oushi categorizes every email and adds a colored label in your Gmail sidebar — so your inbox stays organized even when you're not in Oushi."
      />

      {/* Preview of the label set */}
      <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] p-4 mb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-3">
          The categories
        </p>
        <div className="flex flex-wrap gap-2">
          {LABEL_PALETTE.map((l, i) => (
            <span
              key={l.name}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium"
              style={{ backgroundColor: l.color, color: l.text }}
            >
              <span className="font-mono opacity-70">{i + 1}</span>
              {l.name}
            </span>
          ))}
        </div>
        <p className="text-[11.5px] text-[#766E63] mt-3 leading-relaxed">
          Oushi picks the single best category for each email. Updates as the
          state changes — e.g., once you reply, the Respond label is removed.
          You can override any label from inside the email panel.
        </p>
      </div>

      {/* Apply button */}
      <div className="rounded-xl border border-[#E6DCC4] bg-[#FFFCF3] p-4 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#2A2520]">
              Apply labels to my last {windowLabel} of email
            </p>
            <p className="text-[11.5px] text-[#766E63] mt-1 leading-relaxed">
              Creates the labels in your Gmail and tags every email from the
              last {windowDays} days. From then on, new emails are auto-labeled
              as Oushi ranks them. Older labels self-heal when you reply or
              dismiss — across the same window.
            </p>
          </div>
          <button
            onClick={apply}
            disabled={busy !== null}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-br from-[#5E8FBF] to-[#3D6A95] text-white text-[12.5px] font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-60"
          >
            {busy === "apply" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {busy === "apply" ? "Labeling…" : "Apply labels"}
          </button>
        </div>

        {/* Window selector — applies on next backfill + drives rank self-heal */}
        <div className="mt-3 flex items-center gap-2">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#A89F92]">
            Window
          </p>
          <div className="inline-flex rounded-md border border-[#E6DCC4] overflow-hidden">
            {WINDOW_OPTIONS.map((d, idx) => (
              <button
                key={d}
                onClick={() => setWindowDays(d)}
                disabled={busy !== null}
                className={`text-[11px] px-2.5 py-1 transition-colors ${
                  idx > 0 ? "border-l border-[#E6DCC4]" : ""
                } ${
                  windowDays === d
                    ? "bg-[#3D6A95] text-white font-medium"
                    : "bg-transparent text-[#766E63] hover:text-[#2A2520] hover:bg-[#FAF6EB]"
                } disabled:opacity-50`}
              >
                {d === 14 ? "14d" : d === 30 ? "30d" : "60d"}
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        {busy === "apply" && progress && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11.5px] text-[#766E63]">{phaseLabel(progress)}</p>
              <p className="text-[10.5px] font-mono text-[#A89F92]">{progressPct(progress)}%</p>
            </div>
            <div className="h-1.5 rounded-full bg-[#E6DCC4] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#5E8FBF] to-[#3D6A95] transition-all duration-300 ease-out"
                style={{ width: `${progressPct(progress)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {result && result.scanned > 0 && (
        <div className="rounded-lg border border-[#6B8E68]/30 bg-[#E8EFE5]/40 px-4 py-3 mb-3">
          <p className="text-[12.5px] font-medium text-[#4F6B4D]">
            Labeled {result.applied} of {result.scanned} emails.
          </p>
          {Object.keys(result.breakdown).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(result.breakdown)
                .filter(([k]) => k !== "no_label")
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <span
                    key={k}
                    className="text-[10.5px] font-mono uppercase tracking-wider text-[#4F6B4D] bg-white/60 px-1.5 py-0.5 rounded"
                  >
                    {k} {n}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-4 py-3 mb-3 text-[12.5px] text-[#B86B4A]">
          {error}
        </div>
      )}

      {/* Reset — inline confirm instead of native alert */}
      {!confirmingReset ? (
        <button
          onClick={() => setConfirmingReset(true)}
          disabled={busy !== null}
          className="text-[11.5px] text-[#A89F92] hover:text-[#B86B4A] transition-colors disabled:opacity-50"
        >
          {busy === "reset" ? "Resetting…" : "Remove all Oushi labels from Gmail"}
        </button>
      ) : (
        <div className="rounded-lg border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-[#B86B4A] leading-snug">
            Delete all Oushi/* labels and un-label every message?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setConfirmingReset(false)}
              className="text-[11.5px] text-[#A89F92] hover:text-[#2A2520] px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={reset}
              className="text-[11.5px] font-medium text-white bg-[#B86B4A] hover:bg-[#A65B3F] rounded-md px-2.5 py-1"
            >
              Yes, remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== FILTERS SECTION =====

function FiltersSection({ mutes, onRemove }: { mutes: Mute[]; onRemove: (id: string) => void }) {
  return (
    <div>
      <SectionHeader
        title="Filters"
        description="Senders and domains Oushi automatically hides. Add new mutes from any email's menu."
      />

      {mutes.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <VolumeX className="w-7 h-7 mx-auto text-[#A89F92] mb-3" />
            <p className="text-[14px] font-medium text-[#2A2520]">Nothing muted yet</p>
            <p className="mt-1 text-[12px] text-[#766E63]">
              Use the mute button on any email to add filters here.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-[#E6DCC4]/60">
            {mutes.map((mute) => (
              <div key={mute.id} className="group flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A89F92] w-16 shrink-0">
                    {mute.mute_type}
                  </span>
                  <span className="text-[13px] text-[#2A2520] truncate">{mute.value}</span>
                </div>
                <button
                  onClick={() => onRemove(mute.id)}
                  className="opacity-0 group-hover:opacity-100 text-[#A89F92] hover:text-[#B86B4A] p-1 rounded transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ===== ACCOUNT SECTION =====

function AccountSection({
  userEmail,
  hasGmail,
  exporting,
  onExport,
  onSignOut,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteConfirmText,
  setDeleteConfirmText,
  deleting,
  deleteError,
  onDelete,
}: {
  userEmail: string;
  hasGmail: boolean;
  exporting: boolean;
  onExport: () => void;
  onSignOut: () => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (v: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (v: string) => void;
  deleting: boolean;
  deleteError: string | null;
  onDelete: () => void;
}) {
  return (
    <div>
      <SectionHeader title="Account & data" description="Manage your connection, export your data, or delete your account." />

      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2 px-1">
        Connection
      </p>
      <Card>
        <Row label="Gmail" hint={hasGmail ? `Connected as ${userEmail}` : "Not connected"}>
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${hasGmail ? "bg-[#6B8E68] animate-pulse" : "bg-[#B86B4A]"}`} />
            <a
              href="/api/gmail/connect"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#3D6A95] hover:text-[#5E8FBF]"
            >
              {hasGmail ? "Reconnect" : "Connect"} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </Row>
      </Card>

      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2 mt-6 px-1">
        Data
      </p>
      <Card>
        <Row
          label="Export your data"
          hint="Download a JSON of everything: profile, boards, mutes, synced emails, feedback."
        >
          <button
            onClick={onExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] px-3 py-1.5 text-[12px] font-medium text-[#766E63] hover:text-[#3D6A95] hover:border-[#5E8FBF]/40 disabled:opacity-50 transition-colors"
          >
            {exporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Export
          </button>
        </Row>
      </Card>

      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2 mt-6 px-1">
        Session
      </p>
      <Card>
        <Row label="Sign out" hint="You'll need to sign back in to access your inbox.">
          <button
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] px-3 py-1.5 text-[12px] font-medium text-[#766E63] hover:text-[#2A2520] hover:bg-[#FAF6EB] transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Sign out
          </button>
        </Row>
      </Card>

      {/* Danger zone */}
      <div className="mt-12 rounded-lg border border-[#B86B4A]/25 bg-[#F5E8E0]/30 p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="w-4 h-4 text-[#B86B4A]" />
          <p className="text-[14px] font-semibold text-[#B86B4A]">Danger zone</p>
        </div>
        <p className="text-[12px] text-[#766E63] mb-4">
          Permanent and irreversible. Export your data first if you want to keep it.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#B86B4A]/30 bg-[#FFFCF3] px-3 py-1.5 text-[12px] font-medium text-[#B86B4A] hover:bg-[#F5E8E0]/40"
          >
            <Trash2 className="w-3 h-3" />
            Delete my account
          </button>
        ) : (
          <div className="rounded-md border border-[#B86B4A]/30 bg-[#FFFCF3] p-4">
            <p className="text-[12px] font-medium text-[#2A2520] mb-2">
              This will permanently delete:
            </p>
            <ul className="text-[11px] text-[#766E63] list-disc list-inside space-y-0.5 mb-3 ml-1">
              <li>Profile, boards, memories, feedback history</li>
              <li>All synced email metadata</li>
              <li>Gmail connection (in Oushi)</li>
              <li>Your account — fully removed</li>
            </ul>
            <p className="text-[11px] text-[#766E63] mb-1.5">
              Type <span className="font-mono font-semibold text-[#B86B4A]">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
              className="w-full rounded-md border border-[#B86B4A]/30 bg-[#FAF6EB]/40 px-2.5 py-1.5 text-[13px] font-mono text-[#2A2520] focus:outline-none focus:ring-2 focus:ring-[#B86B4A]/20"
            />
            {deleteError && (
              <p className="mt-2 text-[11px] text-[#B86B4A] flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                {deleteError}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={onDelete}
                disabled={deleteConfirmText !== "DELETE" || deleting}
                className="inline-flex items-center gap-1 rounded-md bg-[#B86B4A] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#A35A3D] disabled:opacity-40 transition-colors"
              >
                {deleting ? <><RefreshCw className="w-3 h-3 animate-spin" />Deleting</> : <><Trash2 className="w-3 h-3" />Permanently delete</>}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                disabled={deleting}
                className="text-[12px] text-[#766E63] hover:text-[#2A2520] px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-[10px] text-[#A89F92] inline-flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" />
        {userEmail}
      </p>
    </div>
  );
}
