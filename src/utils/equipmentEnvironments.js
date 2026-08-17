export const MAX_EQUIPMENT_ENVIRONMENTS = 30;

export const normalizeEquipmentEnvironments = (values) => {
    if (!Array.isArray(values)) return [];

    const seenIds = new Set();
    const result = [];

    for (const value of values) {
        if (!value || typeof value !== 'object') continue;
        const id = String(value.id || '').trim().slice(0, 80);
        const name = String(value.name || '').trim().slice(0, 60);
        const equipment = Array.isArray(value.equipment)
            ? [...new Set(value.equipment.map(item => String(item).trim()).filter(Boolean))].slice(0, 20)
            : [];
        if (!id || !name || equipment.length === 0 || seenIds.has(id)) continue;

        seenIds.add(id);
        result.push({
            id,
            name,
            equipment,
            source: value.source === 'photo' ? 'photo' : 'manual',
            updatedAt: String(value.updatedAt || new Date(0).toISOString()).slice(0, 50),
        });
        if (result.length >= MAX_EQUIPMENT_ENVIRONMENTS) break;
    }

    return result;
};

export const resolveEquipmentEnvironmentHydration = ({ cloud, local, edited }) => {
    const localEnvironments = normalizeEquipmentEnvironments(local);
    if (edited) {
        return { environments: localEnvironments, shouldBackfill: true };
    }
    if (Array.isArray(cloud)) {
        return {
            environments: normalizeEquipmentEnvironments(cloud),
            shouldBackfill: false,
        };
    }
    return {
        environments: localEnvironments,
        shouldBackfill: localEnvironments.length > 0,
    };
};
