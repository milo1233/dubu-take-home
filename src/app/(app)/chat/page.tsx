import VoiceSession from "@/components/voice/VoiceSession";

export default function ChatPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center bg-gradient-to-b from-amber-50 to-rose-50 px-4">
      <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <VoiceSession />
      </div>
    </div>
  );
}
