import { describe, expect, it } from 'vitest';
import { recommendPilotPlan } from '../src/lib/pilot-plan';

describe('Founding 15 plan recommendation', () => {
  it('recommends Core for a focused single-location business', () => {
    expect(recommendPilotPlan({ locations: 1, primaryServices: 3, openTasks: 8, contentDemand: 'standard', needsCallTracking: false, needsCustomReporting: false })).toBe('luna_core');
  });

  it('recommends Plus for expanded execution', () => {
    expect(recommendPilotPlan({ locations: 2, primaryServices: 5, openTasks: 18, contentDemand: 'high', needsCallTracking: false, needsCustomReporting: false })).toBe('luna_plus');
  });

  it('recommends Scale for advanced or multi-location requirements', () => {
    expect(recommendPilotPlan({ locations: 5, primaryServices: 4, openTasks: 10, contentDemand: 'standard', needsCallTracking: true, needsCustomReporting: true })).toBe('luna_scale');
  });
});
