import { ItemCardWorkbench } from '@/features/workbench/item-card-workbench';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-10">
        <div className="flex w-full flex-col gap-6">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
            <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium tracking-[0.18em] uppercase text-muted-foreground">
              Item Thing
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Magic item card builder.
            </h1>
          </div>

          <ItemCardWorkbench />
        </div>
      </main>
    </div>
  );
}
