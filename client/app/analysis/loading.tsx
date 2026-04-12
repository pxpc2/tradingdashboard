export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-48 h-px bg-[#1a1a1a] overflow-hidden">
        <div
          className="h-full bg-[#333] w-1/3"
          style={{
            animation: "shimmer 1.5s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-200%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
    </div>
  );
}
