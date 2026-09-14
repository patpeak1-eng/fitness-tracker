import { describe, it, expect } from 'vitest';
import { normalizeTemplateName, isTemplateNameTaken, firstFreeTemplateName } from './templateNames';

const custom = (name, over = {}) => ({ id: `tpl_custom_${name}`, name, isCustom: true, exercises: [], ...over });
const builtIn = (name) => ({ id: name, name, exercises: [] });

describe('normalizeTemplateName', () => {
    it('folds case and trims', () => {
        expect(normalizeTemplateName(' push DAY ')).toBe(normalizeTemplateName('Push Day'));
    });
    it('treats nothing as an empty name', () => {
        expect(normalizeTemplateName(undefined)).toBe('');
        expect(normalizeTemplateName(null)).toBe('');
    });
});

describe('isTemplateNameTaken', () => {
    it('matches a custom template by normalized name', () => {
        expect(isTemplateNameTaken(' push DAY ', [custom('Push Day')])).toBe(true);
    });
    it('ignores built-ins — the save path refuses those separately', () => {
        expect(isTemplateNameTaken('The Powerhouse', [builtIn('The Powerhouse')])).toBe(false);
    });
    it('is never taken for an empty name', () => {
        expect(isTemplateNameTaken('   ', [custom('')])).toBe(false);
    });
});

describe('firstFreeTemplateName', () => {
    it('suggests "(my version)" when nothing collides', () => {
        expect(firstFreeTemplateName('Name', [])).toBe('Name (my version)');
    });
    it('skips to "(my version 2)" when the first variant exists', () => {
        expect(firstFreeTemplateName('Name', [custom('Name (my version)')])).toBe('Name (my version 2)');
    });
    it('keeps counting past every taken variant, case-insensitively', () => {
        const taken = [custom('name (MY version)'), custom('Name (my version 2)')];
        expect(firstFreeTemplateName('Name', taken)).toBe('Name (my version 3)');
    });
});
