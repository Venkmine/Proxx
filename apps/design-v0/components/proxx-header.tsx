export function ProxxHeader() {
  return (
    <header className="border-b border-slate-800/60 relative">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: "linear-gradient(180deg, rgba(14,16,20,0.98) 0%, rgba(10,11,14,0.95) 100%)",
          boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.04), 0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
      <div className="max-w-[1600px] mx-auto px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          {/* Legacy name: Proxx (deprecated) */}
          <h1 className="text-lg font-mono font-semibold tracking-tight text-slate-100">AWAIRE PROXY</h1>
          <span className="text-xs font-mono text-slate-500 ml-2">v2.4.1</span>
        </div>
        <div className="flex items-center gap-6 text-xs font-mono text-slate-500">
          <span>NODE: RENDER-01</span>
          <span className="text-slate-700">|</span>
          <span>UPTIME: 47:23:18</span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-400">2024-12-16 03:47:22 UTC</span>
        </div>
      </div>
    </header>
  )
}
