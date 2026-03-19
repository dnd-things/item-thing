import { ItemCardWorkbench } from '@/features/workbench/item-card-workbench';

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div className="ambient-glow ambient-glow--warm" />
      <div className="ambient-glow ambient-glow--cool" />

      <main className="mx-auto flex w-full max-w-[1440px] flex-col items-center px-6 py-10 sm:px-8 sm:py-14">
        <div className="relative mb-10 flex w-full flex-col items-center text-center sm:mb-14">
          <div className="ambient-glow ambient-glow--hero" />
          <span className="relative mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-[11px] font-semibold tracking-[0.2em] uppercase text-primary">
            Item Thing
          </span>
          <h1 className="relative font-display text-5xl leading-[1.1] tracking-tight text-balance text-foreground sm:text-6xl lg:text-7xl">
            Magic item card builder
          </h1>
        </div>

        <div className="w-full">
          <ItemCardWorkbench />
        </div>
      </main>
    </div>
  );
}
