// Runs the kudos flow end to end: load the 100-entry dashboard, wait for it, give kudos.
// Lives in the service worker (not the popup) so it keeps going if the popup closes mid-run.
// Progress is kept in chrome.storage.session so a reopened popup picks it up.

const DASHBOARD_URL = 'https://www.strava.com/dashboard?num_entries=100';
const IDLE_STATE = { status: 'idle', current: 0, total: 0, message: '' };

// Source of truth for the current run. Storage is only a mirror for the popup.
let run = IDLE_STATE;
const isBusy = (state) => state.status === 'loading' || state.status === 'running';

function setRunState(patch) {
    run = { ...run, ...patch };
    return chrome.storage.session.set({ run });
}

// If the browser stopped the service worker mid-run, storage still says "running" and the
// popup button would stay disabled forever. On startup, clear that stale state.
const ready = chrome.storage.session.get('run').then(({ run: stored }) => {
    if (stored && isBusy(stored)) {
        return setRunState({ ...stored, status: 'error', message: 'The last run was interrupted. Try again.' });
    }
});

function todayKey() {
    // Local date, so "today" matches the user's day rather than UTC.
    return new Date().toLocaleDateString('en-CA');
}

async function recordKudos(count) {
    if (count === 0) return;
    const { dailyCounts = {} } = await chrome.storage.local.get('dailyCounts');
    const key = todayKey();
    dailyCounts[key] = (dailyCounts[key] || 0) + count;
    await chrome.storage.local.set({ dailyCounts });
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Strava took too long to load. Try again.'));
        }, timeoutMs);

        function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }
        chrome.tabs.onUpdated.addListener(listener);
    });
}

// Injected into the Strava page. Must be self-contained: it is serialised and has no
// access to anything else in this file.
async function giveKudosInPage() {
    const CLICK_INTERVAL_MS = 400;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const findButtons = () => Array.from(document.querySelectorAll('button[data-testid="kudos_button"]'));

    function isKudosGiven(button) {
        const title = (button.getAttribute('title') || '').toLowerCase();
        const svg = button.querySelector('svg');
        return title === 'view all kudos' ||
            svg?.getAttribute('data-testid') === 'filled_kudos' ||
            svg?.getAttribute('fill') === '#fc5200';
    }

    // The feed renders client-side, so wait until the button count stops changing.
    let buttons = [];
    for (let waited = 0, stableFor = 0; waited < 20000 && stableFor < 1500; waited += 500) {
        await sleep(500);
        const found = findButtons();
        stableFor = found.length > 0 && found.length === buttons.length ? stableFor + 500 : 0;
        buttons = found;
    }

    if (buttons.length === 0) {
        return { success: false, message: 'No kudos buttons found. Strava may have changed its page layout.' };
    }

    const pending = buttons.filter((button) => !isKudosGiven(button));
    const total = pending.length;
    chrome.runtime.sendMessage({ type: 'progress', current: 0, total });

    for (let i = 0; i < total; i++) {
        if (!isKudosGiven(pending[i])) pending[i].click();
        chrome.runtime.sendMessage({ type: 'progress', current: i + 1, total });
        if (i < total - 1) await sleep(CLICK_INTERVAL_MS);
    }

    // Give Strava a moment to update the buttons, then count only the kudos that stuck.
    await sleep(1500);
    const confirmed = pending.filter(isKudosGiven).length;
    return { success: true, attempted: total, confirmed };
}

async function runKudos(tabId) {
    await ready;
    if (isBusy(run)) return;

    run = IDLE_STATE;
    await setRunState({ status: 'loading' });

    try {
        const tab = await chrome.tabs.get(tabId);
        // tab.url is only visible for Strava tabs (our host permission), so undefined means "not Strava".
        if (!tab.url?.startsWith('https://www.strava.com/')) {
            throw new Error('Open strava.com in this tab first.');
        }

        if (tab.url !== DASHBOARD_URL || tab.status !== 'complete') {
            const loaded = waitForTabComplete(tabId);
            await chrome.tabs.update(tabId, { url: DASHBOARD_URL });
            await loaded;
        }

        await setRunState({ status: 'running' });
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: giveKudosInPage,
        });

        if (!result?.success) throw new Error(result?.message || 'Something went wrong on the page.');

        await recordKudos(result.confirmed);
        await setRunState({ status: 'done', ...result, message: summarise(result) });
    } catch (error) {
        await setRunState({ status: 'error', message: error.message });
    }
}

function summarise({ attempted, confirmed }) {
    if (attempted === 0) return 'Everyone already has your kudos.';
    const plural = (n) => `${n} ${n === 1 ? 'activity' : 'activities'}`;
    const missed = attempted - confirmed;
    if (missed === 0) return `Gave kudos to ${plural(confirmed)}.`;
    const retry = 'Strava may be rate limiting - try again later.';
    return confirmed === 0
        ? `Couldn't give kudos to ${plural(missed)}. ${retry}`
        : `Gave kudos to ${plural(confirmed)}. ${missed} more didn't go through. ${retry}`;
}

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'start') {
        runKudos(message.tabId);
    } else if (message.type === 'progress' && sender.tab) {
        setRunState({ current: message.current, total: message.total });
    }
});
