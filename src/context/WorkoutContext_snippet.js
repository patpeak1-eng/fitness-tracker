// --- ANALYTICS HELPERS ---
const getMuscleVolumeDistribution = () => {
    if (!history) return { data: [], insight: '' };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const counts = {
        Chest: 0,
        Back: 0,
        Shoulders: 0,
        Legs: 0,
        Arms: 0,
        Core: 0
    };

    const muscleMapping = {
        'Chest': 'Chest',
        'Back': 'Back',
        'Shoulders': 'Shoulders',
        'Legs': 'Legs',
        'Arms': 'Arms',
        'Use Default': 'Core' // Catch-alls
    };

    let totalSets = 0;

    history.forEach(workout => {
        const wDate = new Date(workout.startTime);
        if (wDate < cutoff || !workout.completed) return;

        workout.exercises.forEach(exData => {
            let group = exData.exercise.muscleGroup;

            // Normalize group names from DEFAULT_EXERCISES
            // "Shoulders", "Chest", "Back", "Arms", "Legs", "Core" are standard.
            // "Conditioning" -> Assume Legs/Core? Let's skip or map to Core.
            // "Functional" -> Legs/Back? 

            // Simple normalization
            if (!counts.hasOwnProperty(group)) {
                // Try to map
                if (group === 'Functional') group = 'Core';
                else if (group === 'Conditioning') group = 'Core'; // Cardio often core/legs
                else if (group === 'Recovery') return; // Yoga recovery
                else if (group === 'Full Body') return; // Hard to split, skip
                else return; // Unknown
            }

            // Count completed sets
            const setProps = exData.sets.filter(s => s.completed).length;
            if (setProps > 0) {
                counts[group] += setProps;
                totalSets += setProps;
            }
        });
    });

    // Format for Recharts { subject: 'Chest', A: 120, fullMark: 150 }
    // We want Percentage? Or Raw?
    // Radar charts are good with normalized data if we want shape, 
    // but raw data shows volume bias better.
    // Let's use Percentage for the "Balance" aspect (0-100%).

    const data = Object.keys(counts).map(key => ({
        subject: key,
        A: totalSets > 0 ? Math.round((counts[key] / totalSets) * 100) : 0,
        fullMark: 100
    }));

    // Generate Insight
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1]; // Only consider those with 0? Or just lowest.

    let insight = "Keep logging workouts to see your balance!";
    if (totalSets > 5) {
        const topName = top[1] > 0 ? top[0] : "None";
        // Find lowest non-zero? Or absolute zero?
        // If someone skips Legs entirely, bottom is "Legs" (0).
        const bottomName = bottom[0];

        insight = `You represent a heavy focus on ${topName} (${Math.round((top[1] / totalSets) * 100)}%). Consider more ${bottomName} work for balance.`;
    }

    return { data, insight };
};
