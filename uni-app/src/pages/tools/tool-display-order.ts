export const AION_OBS_TOOL_KEY = 'aion_obs_calculator' as const;

export type BackendToolLike = {
  key: string;
};

export type ToolDisplayItem<Tool extends BackendToolLike = BackendToolLike> =
  | { type: 'backend'; key: Tool['key']; tool: Tool }
  | { type: 'aionObs'; key: typeof AION_OBS_TOOL_KEY };

export function buildToolDisplayItems<Tool extends BackendToolLike>(tools: Tool[]): ToolDisplayItem<Tool>[] {
  const result: ToolDisplayItem<Tool>[] = [];
  let inserted = false;

  tools.forEach((tool) => {
    result.push({ type: 'backend', key: tool.key, tool });
    if (tool.key === 'phone_frame') {
      result.push({ type: 'aionObs', key: AION_OBS_TOOL_KEY });
      inserted = true;
    }
  });

  if (!inserted) {
    result.push({ type: 'aionObs', key: AION_OBS_TOOL_KEY });
  }

  return result;
}
