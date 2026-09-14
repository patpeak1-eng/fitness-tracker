// Name rules for saving a template from the prep screen (S32 template removal
// spec, §3 / decision B). Pure: no context, no storage.

// Trimmed and case-folded: "Push Day" and " push DAY " are the same name.
export const normalizeTemplateName = (name) => (name ?? '').toString().trim().toLowerCase();

// Does any CUSTOM template already carry this name? Built-ins are not
// consulted — the save path refuses a built-in's own name separately.
export const isTemplateNameTaken = (name, templates) => {
    const wanted = normalizeTemplateName(name);
    if (!wanted) return false;
    return (templates || []).some(t => t?.isCustom && normalizeTemplateName(t.name) === wanted);
};

// "<base> (my version)", then "(my version 2)", "(my version 3)"… — the first
// one no custom template uses. Prefilled when forking a built-in.
export const firstFreeTemplateName = (base, templates) => {
    const stem = (base ?? '').toString().trim();
    let candidate = `${stem} (my version)`;
    for (let n = 2; isTemplateNameTaken(candidate, templates); n += 1) {
        candidate = `${stem} (my version ${n})`;
    }
    return candidate;
};
