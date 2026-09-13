// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000" }
/**
 * S32 Fix 2b — sign-in must establish a STABLE identity, or refuse.
 *
 * These mount the real Login component and drive the real form, for the reason
 * the 1b review made expensive: helper-level tests kept passing while the code
 * they were supposed to cover did nothing. Removing the guard, or restoring the
 * 'cloud_' + Date.now() fallback, must fail these.
 *
 * What is stubbed: ApiService (the trust boundary) and window.location.href
 * (jsdom cannot navigate). StorageService is real, so the assertions are about
 * what actually lands in storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Node's experimental localStorage shadows jsdom's here; a map is all these need.
const memoryStorage = () => {
    let s = new Map();
    return {
        getItem: k => (s.has(k) ? s.get(k) : null),
        setItem: (k, v) => { s.set(k, String(v)); },
        removeItem: k => { s.delete(k); },
        clear: () => { s = new Map(); },
        key: i => [...s.keys()][i] ?? null,
        get length() { return s.size; },
    };
};
globalThis.localStorage = memoryStorage();
if (typeof window !== 'undefined') window.localStorage = globalThis.localStorage;

vi.mock('../services/ApiService', async (importOriginal) => {
    const actual = await importOriginal();
    const mocked = {};
    for (const name of Object.keys(actual)) mocked[name] = vi.fn(async () => undefined);
    mocked.isAvailable = vi.fn(() => true);
    return mocked;
});
vi.mock('./Login.css', () => ({}));

const ApiService = await import('../services/ApiService');
const StorageService = (await import('../services/StorageService')).default;
const Login = (await import('./Login')).default;

const SERVER_ID = '11111111-2222-3333-4444-555555555555';

let container, root, navigatedTo;

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    navigatedTo = null;
    // jsdom refuses real navigation; capture the intent instead.
    delete window.location;
    window.location = { href: '' };
    Object.defineProperty(window.location, 'href', {
        get: () => navigatedTo ?? '',
        set: (v) => { navigatedTo = v; },
        configurable: true,
    });
});

afterEach(async () => {
    if (root) await act(async () => { root.unmount(); });
    container?.remove();
    root = null;
});

const mount = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        root = createRoot(container);
        root.render(<Login />);
    });
};

const type = async (selector, value) => {
    const el = container.querySelector(selector);
    if (!el) throw new Error(`no element for ${selector}`);
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

const submit = async () => {
    const form = container.querySelector('form');
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 0));
    });
};

const signIn = async (email = 'user@example.com', password = 'pw12345678') => {
    await type('input[type="email"]', email);
    await type('input[type="password"]', password);
    await submit();
};

const errorText = () => container.textContent || '';
const storedProfiles = () => StorageService.loadProfiles();

describe('password sign-in identity', () => {
    it('adopts the id the server returned', async () => {
        ApiService.login.mockResolvedValue({
            access_token: 'tok', token_type: 'bearer', user_id: SERVER_ID,
        });
        await mount();
        await signIn();

        expect(storedProfiles().map(p => p.id)).toEqual([SERVER_ID]);
        expect(StorageService.loadCurrentProfileId()).toBe(SERVER_ID);
        expect(navigatedTo).toBe('/');
    });

    it('gives the same profile id on a second sign-in', async () => {
        // The actual bug: the id used to change on EVERY sign-in, so each one
        // orphaned the data scoped to the previous profile.
        ApiService.login.mockResolvedValue({ access_token: 'a', user_id: SERVER_ID });
        await mount();
        await signIn();
        const first = StorageService.loadCurrentProfileId();

        await act(async () => { root.unmount(); root = null; });
        ApiService.login.mockResolvedValue({ access_token: 'b', user_id: SERVER_ID });
        await mount();
        await signIn();

        expect(StorageService.loadCurrentProfileId()).toBe(first);
    });

    it('REFUSES to sign in when the server returns no user_id', async () => {
        ApiService.login.mockResolvedValue({ access_token: 'tok', token_type: 'bearer' });
        await mount();
        await signIn();

        expect(storedProfiles(), 'a profile was activated without an identity').toEqual([]);
        expect(StorageService.loadCurrentProfileId()).toBeFalsy();
        expect(navigatedTo, 'navigated away despite having no identity').toBeNull();
        expect(errorText()).toMatch(/did not identify your account/i);
    });

    it('never invents an id of its own', async () => {
        // Guards the specific fallback that was removed.
        ApiService.login.mockResolvedValue({ access_token: 'tok' });
        await mount();
        await signIn();

        const invented = storedProfiles().map(p => String(p.id));
        expect(invented.filter(id => id.startsWith('cloud_'))).toEqual([]);
        expect(invented).toEqual([]);
    });

    it('refuses, and stops loading, when there is no token either', async () => {
        // This used to fall through silently and leave the spinner for ever.
        ApiService.login.mockResolvedValue({});
        await mount();
        await signIn();

        expect(errorText()).toMatch(/did not identify your account/i);
        expect(storedProfiles()).toEqual([]);
        const submitBtn = container.querySelector('button[type="submit"]');
        expect(submitBtn?.disabled, 'the form stayed stuck in its loading state').toBeFalsy();
    });

    it('a server error still shows the server message, not the identity one', async () => {
        ApiService.login.mockRejectedValue(new Error('Invalid email or password'));
        await mount();
        await signIn();

        expect(errorText()).toMatch(/invalid email or password/i);
        expect(storedProfiles()).toEqual([]);
    });

    it('registration adopts the returned id too', async () => {
        ApiService.register.mockResolvedValue({ access_token: 'tok', user_id: SERVER_ID });
        await mount();
        // switch to the register form
        const tabs = [...container.querySelectorAll('button')];
        const registerTab = tabs.find(b => /create account|register|sign up/i.test(b.textContent));
        await act(async () => { registerTab?.click(); });

        await type('input[type="text"]', 'Tester');
        await type('input[type="email"]', 'new@example.com');
        const pws = container.querySelectorAll('input[type="password"]');
        for (const el of pws) {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            await act(async () => {
                setter.call(el, 'pw12345678');
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
        await submit();

        expect(storedProfiles().map(p => p.id)).toEqual([SERVER_ID]);
    });

    it('registration refuses without a user_id', async () => {
        ApiService.register.mockResolvedValue({ access_token: 'tok' });
        await mount();
        const tabs = [...container.querySelectorAll('button')];
        const registerTab = tabs.find(b => /create account|register|sign up/i.test(b.textContent));
        await act(async () => { registerTab?.click(); });

        await type('input[type="text"]', 'Tester');
        await type('input[type="email"]', 'new@example.com');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        for (const el of container.querySelectorAll('input[type="password"]')) {
            await act(async () => {
                setter.call(el, 'pw12345678');
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
        await submit();

        expect(storedProfiles()).toEqual([]);
        expect(errorText()).toMatch(/did not identify your account/i);
    });

    it('continue-without-account still works and is unaffected', async () => {
        // The local-only path has no server identity by design; the guard must
        // not have leaked into it.
        await mount();
        const btn = [...container.querySelectorAll('button')]
            .find(b => /continue without/i.test(b.textContent));
        expect(btn, 'the continue-without-account control is gone').toBeTruthy();
        await act(async () => { btn.click(); });

        expect(StorageService.loadCurrentProfileId()).toBe('user_default');
        expect(navigatedTo).toBe('/');
    });
});
