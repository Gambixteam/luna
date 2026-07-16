export type PilotPlanInput = {
  locations: number;
  primaryServices: number;
  openTasks: number;
  contentDemand: 'light' | 'standard' | 'high';
  needsCallTracking: boolean;
  needsCustomReporting: boolean;
};

export function recommendPilotPlan(input: PilotPlanInput) {
  if (input.locations > 3 || input.needsCallTracking || input.needsCustomReporting) return 'luna_scale';
  if (input.locations > 1 || input.primaryServices > 4 || input.openTasks > 15 || input.contentDemand === 'high') return 'luna_plus';
  return 'luna_core';
}
