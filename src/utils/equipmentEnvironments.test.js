import { describe, expect, it } from 'vitest';
import {
    normalizeEquipmentEnvironments,
    resolveEquipmentEnvironmentHydration,
} from './equipmentEnvironments';

const home = {
    id: 'env_home',
    name: 'Home',
    equipment: ['Dumbbells', 'Dumbbells', 'None'],
    source: 'photo',
    updatedAt: '2026-08-17T12:00:00.000Z',
};
const normalizedHome = { ...home, equipment: ['Dumbbells', 'None'] };

describe('equipment environment sync helpers', () => {
    it('normalizes persisted environments and deduplicates equipment', () => {
        expect(normalizeEquipmentEnvironments([home, home])).toEqual([{
            ...home,
            equipment: ['Dumbbells', 'None'],
        }]);
    });

    it('treats a cloud empty array as authoritative', () => {
        expect(resolveEquipmentEnvironmentHydration({
            cloud: [], local: [home], edited: false,
        })).toEqual({ environments: [], shouldBackfill: false });
    });

    it('backfills local environments when the cloud field is not initialized', () => {
        expect(resolveEquipmentEnvironmentHydration({
            cloud: null, local: [home], edited: false,
        })).toEqual({ environments: [normalizedHome], shouldBackfill: true });
    });

    it('preserves a local edit made while the cloud pull was in flight', () => {
        expect(resolveEquipmentEnvironmentHydration({
            cloud: [], local: [home], edited: true,
        })).toEqual({ environments: [normalizedHome], shouldBackfill: true });
    });
});
