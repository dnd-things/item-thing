import type { MagicItemWorkbenchState } from './workbench-options';

export interface WorkbenchAutosaveFormValues {
  itemName?: string;
  classificationAndRarity?: string;
  requiresAttunement?: boolean;
  flavorDescription?: string;
  mechanicalDescription?: string;
}

export function bindWorkbenchFormAutosave(input: {
  watch: (callback: (values: WorkbenchAutosaveFormValues) => void) => {
    unsubscribe: () => void;
  };
  getRenderedState: () => MagicItemWorkbenchState;
  scheduleSnapshot: (state: MagicItemWorkbenchState) => void;
  onScheduled?: () => void;
}): { unsubscribe: () => void; scheduleRendered: () => void } {
  const publish = (state: MagicItemWorkbenchState) => {
    input.scheduleSnapshot(state);
    input.onScheduled?.();
  };
  const subscription = input.watch((values) => {
    const rendered = input.getRenderedState();
    publish({
      ...rendered,
      itemName: values.itemName ?? rendered.itemName,
      classificationAndRarity:
        values.classificationAndRarity ?? rendered.classificationAndRarity,
      requiresAttunement:
        values.requiresAttunement ?? rendered.requiresAttunement,
      flavorDescription: values.flavorDescription ?? rendered.flavorDescription,
      mechanicalDescription:
        values.mechanicalDescription ?? rendered.mechanicalDescription,
    });
  });
  return {
    unsubscribe() {
      subscription.unsubscribe();
    },
    scheduleRendered() {
      publish(input.getRenderedState());
    },
  };
}
