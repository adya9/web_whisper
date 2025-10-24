'use client'
import VapiWidget from "./VapiWidget";

export default function ChatBox() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <VapiWidget
        apiKey={process.env.NEXT_PUBLIC_VAPI_API_KEY || ""}
        assistantId={process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || ""}
      />
    </div>
  );
}