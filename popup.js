// The popup is just a view: background.js runs the flow and writes state to storage,
// and this file renders whatever is in storage (so closing and reopening is safe).

const giveKudosBtn = document.getElementById('giveKudosBtn');
const status = document.getElementById('status');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');

function renderRun(run = { status: 'idle' }) {
    const busy = run.status === 'loading' || run.status === 'running';
    giveKudosBtn.disabled = busy;
    giveKudosBtn.textContent = busy ? 'Giving kudos…' : 'Give Kudos';

    progress.hidden = !busy;
    const percent = run.total > 0 ? Math.round((run.current / run.total) * 100) : 0;
    progressFill.style.width = `${percent}%`;

    status.className = 'status';
    if (run.status === 'loading') {
        status.textContent = 'Loading your feed…';
    } else if (run.status === 'running') {
        status.textContent = run.total > 0 ? `Giving kudos: ${run.current} of ${run.total}` : 'Finding activities…';
    } else if (run.status === 'done') {
        status.textContent = run.message;
        status.classList.add(run.confirmed < run.attempted ? 'warning' : 'success');
    } else if (run.status === 'error') {
        status.textContent = run.message;
        status.classList.add('error');
    } else {
        status.textContent = '';
    }
}

function renderStats(dailyCounts = {}) {
    const dayKey = (daysAgo) => {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        return date.toLocaleDateString('en-CA');
    };
    let week = 0;
    for (let i = 0; i < 7; i++) week += dailyCounts[dayKey(i)] || 0;

    document.getElementById('statToday').textContent = dailyCounts[dayKey(0)] || 0;
    document.getElementById('statWeek').textContent = week;
    document.getElementById('statAll').textContent = Object.values(dailyCounts).reduce((sum, n) => sum + n, 0);
}

giveKudosBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ type: 'start', tabId: tab.id });
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.run) renderRun(changes.run.newValue);
    if (changes.dailyCounts) renderStats(changes.dailyCounts.newValue);
});

chrome.storage.session.get('run').then(({ run }) => renderRun(run));
chrome.storage.local.get('dailyCounts').then(({ dailyCounts }) => renderStats(dailyCounts));
