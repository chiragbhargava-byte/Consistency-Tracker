// Consistency Tracker Application Logic

// --- GLOBAL STATE ---
let trackerState = {
    days: {}, // format: { "YYYY-MM-DD": { tasks: [...], focusedHours: 0 } }
    timer: {
        startTime: null,      // timestamp when timer was started
        accumulatedTime: 0,   // accumulated milliseconds before pausing
        isRunning: false
    }
};

let currentSelectedDate = new Date(); // tracks the active day shown in Planner
let activeTimerInterval = null;
let taskToMarkIncompleteId = null; // tracks task ID when showing reason modal
let activeProfile = null;
let allProfiles = [];
let syncTimer = null;
let sharedServerAvailable = false;

const DAILY_QUOTES = [
    { text: "Discipline is choosing between what you want most and what you want now.", author: "Abraham Lincoln" },
    { text: "Consistency turns effort into identity.", author: "Unknown" },
    { text: "Small daily improvements are the key to staggering results.", author: "Robin Sharma" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
    { text: "Your focus determines your future.", author: "Unknown" },
    { text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
    { text: "Progress, not perfection, is the goal.", author: "Unknown" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Study now, succeed later. The work pays off.", author: "Unknown" }
];

// Preset Reasons List
const PRESET_REASONS = [
    "Lack of time / Overcommitted",
    "Procrastination / Low motivation",
    "Fatigue / Felt tired",
    "Distractions (Phone, Social Media)",
    "Unexpected interruptions / Emergency",
    "Task was too difficult / Blocked"
];

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    await loadFromLocalStorage();
    initializeEventListeners();
    renderDailyQuote();
    selectDate(new Date()); // default to today
    setupMonthFilterDropdown();
    updateDashboardStats();
    renderHeatmap();
    initTimerFromState();
    initializeSocial();

    // Initial icon render
    lucide.createIcons();
});

// --- LOCAL STORAGE HANDLING ---
function saveToLocalStorage() {
    localStorage.setItem("consistency_tracker_state", JSON.stringify(trackerState));
}

async function loadFromLocalStorage() {
    const saved = localStorage.getItem("consistency_tracker_state");
    if (saved) {
        try {
            trackerState = JSON.parse(saved);
            
            // Ensure data structure integrity
            if (!trackerState.days) trackerState.days = {};
            if (!trackerState.timer) {
                trackerState.timer = { startTime: null, accumulatedTime: 0, isRunning: false };
            }
            return;
        } catch (e) {
            console.error("Error parsing localStorage data:", e);
        }
    }

    try {
        const response = await fetch("/api/profiles");
        if (!response.ok) return;
        const data = await response.json();
        const profiles = Array.isArray(data.profiles) ? data.profiles : [];
        if (!profiles.length) return;

        const latestProfile = profiles
            .filter(profile => profile && profile.trackerState)
            .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];

        if (!latestProfile) return;

        trackerState = latestProfile.trackerState || { days: {}, timer: { startTime: null, accumulatedTime: 0, isRunning: false } };
        if (!trackerState.days) trackerState.days = {};
        if (!trackerState.timer) trackerState.timer = { startTime: null, accumulatedTime: 0, isRunning: false };

        localStorage.setItem("consistency_tracker_state", JSON.stringify(trackerState));
    } catch (error) {
        console.info("No saved tracker backup was available to import automatically.", error);
    }
}

// --- SHARED PROFILES & FRIENDS ---
function profileId() {
    return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not reach the shared tracker.");
    return data;
}

async function initializeSocial() {
    activeProfile = { id: "local", name: "My Tracker", friends: [], trackerState };
    allProfiles = [activeProfile];
    const syncStatusEl = document.getElementById("sync-status");
    if (syncStatusEl) syncStatusEl.textContent = "Saved on this device";
    renderSocial();
}

function queueProfileSync() {
    if (!sharedServerAvailable || !activeProfile || activeProfile.id === "local") return;
    clearTimeout(syncTimer);
    document.getElementById("sync-status").textContent = "Saving…";
    syncTimer = setTimeout(async () => {
        try {
            const data = await api(`/api/profiles/${activeProfile.id}`, { method: "PUT", body: JSON.stringify(activeProfile) });
            activeProfile = data.profile;
            const index = allProfiles.findIndex(profile => profile.id === activeProfile.id);
            if (index >= 0) allProfiles[index] = activeProfile;
            document.getElementById("sync-status").textContent = "Shared & up to date";
        } catch (_) { document.getElementById("sync-status").textContent = "Saved locally — sync unavailable"; }
    }, 500);
}

function activitySummary(profile) {
    const days = profile.trackerState?.days || {};
    const today = formatDateLocal(new Date());
    const day = days[today] || { tasks: [], focusedHours: 0 };
    const completed = (day.tasks || []).filter(task => task.completed).length;
    const total = (day.tasks || []).length;
    const hours = Number(day.focusedHours) || 0;
    const lastActive = Object.keys(days).filter(date => {
        const entry = days[date];
        return (Number(entry.focusedHours) || 0) > 0 || (entry.tasks || []).some(task => task.completed);
    }).sort().pop();
    return { completed, total, hours, lastActive };
}

function renderSocial() {
    if (!activeProfile) return;
}

function getDailyQuoteIndex() {
    const today = new Date();
    const dateKey = formatDateLocal(today);
    const seed = dateKey.split('-').join('');
    const numericSeed = Number(seed) || 0;
    return numericSeed % DAILY_QUOTES.length;
}

function renderDailyQuote() {
    const quoteElement = document.getElementById("daily-quote-text");
    const authorElement = document.getElementById("daily-quote-author");
    const dayLabelElement = document.getElementById("quote-day-label");

    if (!quoteElement || !authorElement || !dayLabelElement) return;

    const index = getDailyQuoteIndex();
    const quote = DAILY_QUOTES[index];
    quoteElement.textContent = `“${quote.text}”`;
    authorElement.textContent = `— ${quote.author}`;
    dayLabelElement.textContent = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function refreshAllForProfile() {
    selectDate(new Date());
    setupMonthFilterDropdown();
    updateDashboardStats();
    renderHeatmap();
    initTimerFromState();
    renderSocial();
}

async function refreshFriends() {
    renderSocial();
}

function switchProfile(id) {
    if (!allProfiles.length) return;
    const profile = allProfiles.find(item => item.id === id) || allProfiles[0];
    if (!profile || profile.id === activeProfile.id) return;
    activeProfile = profile;
    trackerState = activeProfile.trackerState || { days: {}, timer: { startTime: null, accumulatedTime: 0, isRunning: false } };
    refreshAllForProfile();
}

async function createProfile(name) {
    const safeName = String(name || "").trim();
    if (!safeName) return;
    const profile = { id: profileId(), name: safeName, friends: [], trackerState: { days: {}, timer: { startTime: null, accumulatedTime: 0, isRunning: false } } };
    allProfiles.push(profile);
    switchProfile(profile.id);
}

// --- DATE HELPER FUNCTIONS ---
function formatDateLocal(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(date) {
    const today = formatDateLocal(new Date());
    const yesterday = formatDateLocal(new Date(Date.now() - 86400000));
    const target = formatDateLocal(date);
    
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    const formatted = date.toLocaleDateString('en-US', options);
    
    if (target === today) {
        return `Today, ${formatted}`;
    } else if (target === yesterday) {
        return `Yesterday, ${formatted}`;
    } else {
        return formatted;
    }
}

// --- STATE MUTATORS & RENDER CONTROLLERS ---
function selectDate(date) {
    currentSelectedDate = date;
    const dateStr = formatDateLocal(date);
    
    // Update date display UI
    document.getElementById("display-date").textContent = formatDisplayDate(date);
    
    // Initialize day entry if not exists
    if (!trackerState.days[dateStr]) {
        trackerState.days[dateStr] = {
            tasks: [],
            focusedHours: 0
        };
    }
    
    renderTaskList();
    updateDayTimerUI();
    
    // Enable/disable next button if we are looking at future
    const todayStr = formatDateLocal(new Date());
    // (Optional: let them log future, but let's highlight if it's future)
}

function updateDayTimerUI() {
    const dateStr = formatDateLocal(currentSelectedDate);
    const dayObj = trackerState.days[dateStr] || { focusedHours: 0 };
    
    // Update input placeholder or value if applicable
    document.getElementById("input-manual-hours").value = "";
}

function renderTaskList() {
    const dateStr = formatDateLocal(currentSelectedDate);
    const dayObj = trackerState.days[dateStr];
    const taskList = document.getElementById("task-list");
    const countBadge = document.getElementById("task-count-badge");
    
    taskList.innerHTML = "";
    
    if (!dayObj || !dayObj.tasks || dayObj.tasks.length === 0) {
        taskList.innerHTML = `
            <li class="empty-state">
                <i data-lucide="clipboard-list"></i>
                <p>No tasks added for this day yet. Plan your day above!</p>
            </li>
        `;
        countBadge.textContent = "0 tasks";
        lucide.createIcons();
        return;
    }
    
    countBadge.textContent = `${dayObj.tasks.length} task${dayObj.tasks.length > 1 ? 's' : ''}`;
    
    dayObj.tasks.forEach(task => {
        const li = document.createElement("li");
        li.className = `task-item ${task.completed ? 'completed' : ''} ${(!task.completed && task.reason) ? 'incomplete' : ''}`;
        li.setAttribute("data-task-id", task.id);
        
        li.innerHTML = `
            <div class="task-main">
                <label class="task-checkbox-wrapper">
                    <input type="checkbox" class="chk-task-complete" ${task.completed ? 'checked' : ''}>
                    <span class="task-checkbox-custom"></span>
                </label>
                <div style="overflow: hidden; flex-grow: 1;">
                    <span class="task-title-text" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
                    ${(!task.completed && task.reason) ? `<span class="task-meta-reason" title="Reason: ${escapeHTML(task.reason)}">Reason: ${escapeHTML(task.reason)}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="btn btn-icon btn-mark-incomplete" title="Mark incomplete / Give reason" ${task.completed ? 'style="display:none;"' : ''}>
                    <i data-lucide="help-circle"></i>
                </button>
                <button class="btn btn-icon btn-delete-task" title="Delete Task">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
        
        // Add event listeners to task elements
        const checkbox = li.querySelector(".chk-task-complete");
        checkbox.addEventListener("change", (e) => {
            toggleTaskCompletion(task.id, e.target.checked);
        });
        
        const btnReason = li.querySelector(".btn-mark-incomplete");
        if (btnReason) {
            btnReason.addEventListener("click", () => {
                showReasonModal(task.id);
            });
        }
        
        const btnDelete = li.querySelector(".btn-delete-task");
        btnDelete.addEventListener("click", () => {
            deleteTask(task.id);
        });
        
        taskList.appendChild(li);
    });
    
    lucide.createIcons();
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// --- TASK ACTIONS ---
function addTask(title) {
    const dateStr = formatDateLocal(currentSelectedDate);
    if (!trackerState.days[dateStr]) {
        trackerState.days[dateStr] = { tasks: [], focusedHours: 0 };
    }
    
    const newTask = {
        id: "task_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        title: title.trim(),
        completed: false,
        reason: ""
    };
    
    trackerState.days[dateStr].tasks.push(newTask);
    saveToLocalStorage();
    renderTaskList();
    updateDashboardStats();
    renderHeatmap();
    updateCharts();
}

function deleteTask(taskId) {
    const dateStr = formatDateLocal(currentSelectedDate);
    const dayObj = trackerState.days[dateStr];
    if (dayObj && dayObj.tasks) {
        dayObj.tasks = dayObj.tasks.filter(t => t.id !== taskId);
        saveToLocalStorage();
        renderTaskList();
        updateDashboardStats();
        renderHeatmap();
        updateCharts();
    }
}

function toggleTaskCompletion(taskId, isCompleted) {
    const dateStr = formatDateLocal(currentSelectedDate);
    const dayObj = trackerState.days[dateStr];
    if (dayObj && dayObj.tasks) {
        const task = dayObj.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = isCompleted;
            if (isCompleted) {
                task.reason = ""; // Clear reason if marked completed
            }
            saveToLocalStorage();
            renderTaskList();
            updateDashboardStats();
            renderHeatmap();
            updateCharts();
        }
    }
}

function saveTaskIncompleteReason(taskId, reason) {
    const dateStr = formatDateLocal(currentSelectedDate);
    const dayObj = trackerState.days[dateStr];
    if (dayObj && dayObj.tasks) {
        const task = dayObj.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = false;
            task.reason = reason.trim();
            saveToLocalStorage();
            renderTaskList();
            updateDashboardStats();
            renderHeatmap();
            updateCharts();
        }
    }
}

// --- FOCUS TIMER MECHANICS ---
function initTimerFromState() {
    if (trackerState.timer.isRunning) {
        // Calculate elapsed time since start
        const now = Date.now();
        const elapsed = now - trackerState.timer.startTime;
        const totalMs = trackerState.timer.accumulatedTime + elapsed;
        
        updateTimerDisplay(totalMs);
        startTimerInterval();
        
        // Update UI button state
        document.getElementById("btn-timer-toggle").classList.add("btn-accent");
        document.getElementById("btn-timer-toggle").classList.remove("btn-primary");
        document.getElementById("icon-timer-toggle").setAttribute("data-lucide", "pause");
        document.getElementById("text-timer-toggle").textContent = "Pause Focus";
        document.getElementById("timer-mode-badge").textContent = "Focusing";
        document.getElementById("timer-mode-badge").classList.add("running");
    } else {
        if (activeTimerInterval) clearInterval(activeTimerInterval);
        activeTimerInterval = null;
        updateTimerDisplay(trackerState.timer.accumulatedTime);
        document.getElementById("timer-mode-badge").textContent = "Idle";
        document.getElementById("timer-mode-badge").classList.remove("running");
    }
    lucide.createIcons();
}

function startTimerInterval() {
    if (activeTimerInterval) clearInterval(activeTimerInterval);
    
    activeTimerInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = now - trackerState.timer.startTime;
        const totalMs = trackerState.timer.accumulatedTime + elapsed;
        updateTimerDisplay(totalMs);
    }, 1000);
}

// Ensure clean format helper
function msToHMS(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function updateTimerDisplay(ms) {
    document.getElementById("timer-clock").textContent = msToHMS(ms);
}

function toggleTimer() {
    const timer = trackerState.timer;
    const now = Date.now();
    const btn = document.getElementById("btn-timer-toggle");
    const icon = document.getElementById("icon-timer-toggle");
    const text = document.getElementById("text-timer-toggle");
    const badge = document.getElementById("timer-mode-badge");
    
    if (!timer.isRunning) {
        // Start Timer
        timer.isRunning = true;
        timer.startTime = now;
        saveToLocalStorage();
        
        startTimerInterval();
        
        btn.classList.add("btn-accent");
        btn.classList.remove("btn-primary");
        icon.setAttribute("data-lucide", "pause");
        text.textContent = "Pause Focus";
        badge.textContent = "Focusing";
        badge.classList.add("running");
    } else {
        // Pause Timer
        timer.isRunning = false;
        const elapsed = now - timer.startTime;
        timer.accumulatedTime += elapsed;
        timer.startTime = null;
        saveToLocalStorage();
        
        if (activeTimerInterval) clearInterval(activeTimerInterval);
        
        btn.classList.remove("btn-accent");
        btn.classList.add("btn-primary");
        icon.setAttribute("data-lucide", "play");
        text.textContent = "Resume Focus";
        badge.textContent = "Paused";
        badge.classList.remove("running");
        
        // Prompt automatically to add hours to today
        addLoggedTimerHoursToToday(true);
    }
    lucide.createIcons();
}

function resetTimer() {
    if (activeTimerInterval) clearInterval(activeTimerInterval);
    
    // If resetting while running, or resetting after accumulate, first save if needed
    if (trackerState.timer.accumulatedTime > 10000 || (trackerState.timer.isRunning && (Date.now() - trackerState.timer.startTime > 10000))) {
        if (confirm("Would you like to save your elapsed focus session hours before resetting?")) {
            addLoggedTimerHoursToToday(false);
        }
    }
    
    trackerState.timer = {
        startTime: null,
        accumulatedTime: 0,
        isRunning: false
    };
    
    saveToLocalStorage();
    updateTimerDisplay(0);
    
    const btn = document.getElementById("btn-timer-toggle");
    const icon = document.getElementById("icon-timer-toggle");
    const text = document.getElementById("text-timer-toggle");
    const badge = document.getElementById("timer-mode-badge");
    
    btn.classList.remove("btn-accent");
    btn.classList.add("btn-primary");
    icon.setAttribute("data-lucide", "play");
    text.textContent = "Start Focus";
    badge.textContent = "Idle";
    badge.classList.remove("running");
    
    lucide.createIcons();
}

function addLoggedTimerHoursToToday(resetAfterAdding = true) {
    const timer = trackerState.timer;
    let elapsedMs = timer.accumulatedTime;
    
    if (timer.isRunning && timer.startTime) {
        elapsedMs += (Date.now() - timer.startTime);
    }
    
    if (elapsedMs < 1000) return; // ignore less than a second
    
    const hoursDecimal = elapsedMs / (1000 * 60 * 60);
    
    // Add to current date
    const dateStr = formatDateLocal(currentSelectedDate);
    if (!trackerState.days[dateStr]) {
        trackerState.days[dateStr] = { tasks: [], focusedHours: 0 };
    }
    
    trackerState.days[dateStr].focusedHours += parseFloat(hoursDecimal.toFixed(2));
    
    if (resetAfterAdding) {
        trackerState.timer = {
            startTime: timer.isRunning ? Date.now() : null,
            accumulatedTime: 0,
            isRunning: timer.isRunning
        };
    }
    
    saveToLocalStorage();
    updateDayTimerUI();
    updateDashboardStats();
    renderHeatmap();
    updateCharts();
    
    if (resetAfterAdding && !timer.isRunning) {
        updateTimerDisplay(0);
        document.getElementById("text-timer-toggle").textContent = "Start Focus";
    }
}

function logManualHours(hours) {
    if (isNaN(hours) || hours <= 0) return;
    
    const dateStr = formatDateLocal(currentSelectedDate);
    if (!trackerState.days[dateStr]) {
        trackerState.days[dateStr] = { tasks: [], focusedHours: 0 };
    }
    
    trackerState.days[dateStr].focusedHours += parseFloat(hours.toFixed(1));
    saveToLocalStorage();
    updateDayTimerUI();
    updateDashboardStats();
    renderHeatmap();
    updateCharts();
    
    alert(`Successfully added ${hours} focused hours to ${formatDisplayDate(currentSelectedDate)}!`);
}

// --- STATS & ANALYTICS ---
function updateDashboardStats() {
    // 1. Total Hours Studied
    let totalHours = 0;
    let totalTasksPlanned = 0;
    let totalTasksCompleted = 0;
    
    Object.values(trackerState.days).forEach(day => {
        totalHours += day.focusedHours || 0;
        if (day.tasks) {
            totalTasksPlanned += day.tasks.length;
            totalTasksCompleted += day.tasks.filter(t => t.completed).length;
        }
    });
    
    document.getElementById("stat-total-hours").textContent = `${totalHours.toFixed(1)} hrs`;
    
    // 2. Completion Rate
    const completionRate = totalTasksPlanned > 0 
        ? Math.round((totalTasksCompleted / totalTasksPlanned) * 100) 
        : 0;
    document.getElementById("stat-completion-rate").textContent = `${completionRate}%`;
    
    // 3. Streaks
    const streaks = calculateStreaks();
    document.getElementById("stat-current-streak").textContent = `${streaks.current} day${streaks.current !== 1 ? 's' : ''}`;
    document.getElementById("stat-best-streak").textContent = `${streaks.best} day${streaks.best !== 1 ? 's' : ''}`;

    // 4. Current week's focus-hours snapshot (Monday through Sunday).
    renderWeeklyStudyProgress();

    // 5. Previous week's focus-hours snapshot.
    renderLastWeekStudyProgress();
    
    // 6. Reason insights list
    renderReasonInsights();
}

function renderWeeklyStudyProgress() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const monday = new Date(now);
    const daysSinceMonday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - daysSinceMonday);

    const weekDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        const dateStr = formatDateLocal(date);
        const hours = Number(trackerState.days[dateStr]?.focusedHours) || 0;
        return { date, hours };
    });
    const weeklyHours = weekDays.reduce((sum, day) => sum + day.hours, 0);
    const maxHours = Math.max(...weekDays.map(day => day.hours), 1);
    const weekEnd = weekDays[6].date;
    const rangeOptions = { month: "short", day: "numeric" };

    document.getElementById("stat-weekly-hours").textContent = `${weeklyHours.toFixed(1)} hrs`;
    document.getElementById("weekly-study-range").textContent =
        `${monday.toLocaleDateString("en-US", rangeOptions)} – ${weekEnd.toLocaleDateString("en-US", rangeOptions)}`;

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    document.getElementById("weekly-study-days").innerHTML = weekDays.map(({ date, hours }) => {
        const isToday = formatDateLocal(date) === formatDateLocal(now);
        const height = hours > 0 ? Math.max(12, (hours / maxHours) * 100) : 5;
        const label = `${dayNames[date.getDay()]}: ${hours.toFixed(1)} focused hours`;
        return `
            <div class="weekly-day${isToday ? " is-today" : ""}" title="${label}">
                <span class="weekly-day-hours">${hours > 0 ? `${hours.toFixed(1)}h` : "—"}</span>
                <div class="weekly-bar-track"><span class="weekly-bar-fill" style="height: ${height}%"></span></div>
                <span class="weekly-day-label">${dayNames[date.getDay()]}</span>
            </div>`;
    }).join("");
}

function renderLastWeekStudyProgress() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const currentWeekMonday = new Date(now);
    const daysSinceMonday = (currentWeekMonday.getDay() + 6) % 7;
    currentWeekMonday.setDate(currentWeekMonday.getDate() - daysSinceMonday);

    const lastWeekMonday = new Date(currentWeekMonday);
    lastWeekMonday.setDate(currentWeekMonday.getDate() - 7);

    const lastWeekSunday = new Date(lastWeekMonday);
    lastWeekSunday.setDate(lastWeekMonday.getDate() + 6);

    const lastWeekDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(lastWeekMonday);
        date.setDate(lastWeekMonday.getDate() + index);
        const dateStr = formatDateLocal(date);
        const hours = Number(trackerState.days[dateStr]?.focusedHours) || 0;
        return { date, hours };
    });

    const lastWeekHours = lastWeekDays.reduce((sum, day) => sum + day.hours, 0);
    const rangeOptions = { month: "short", day: "numeric" };

    document.getElementById("stat-last-week-hours").textContent = `${lastWeekHours.toFixed(1)} hrs`;
    document.getElementById("last-week-study-range").textContent =
        `${lastWeekMonday.toLocaleDateString("en-US", rangeOptions)} – ${lastWeekSunday.toLocaleDateString("en-US", rangeOptions)}`;
}

function calculateStreaks() {
    const dates = Object.keys(trackerState.days).sort();
    if (dates.length === 0) {
        return { current: 0, best: 0 };
    }
    
    // Activity threshold check: a day is consistent if they completed >=1 task OR have study hours > 0
    function isConsistent(dateStr) {
        const day = trackerState.days[dateStr];
        if (!day) return false;
        const hasHours = day.focusedHours && day.focusedHours > 0;
        const hasDoneTasks = day.tasks && day.tasks.some(t => t.completed);
        return hasHours || hasDoneTasks;
    }
    
    // Generate consecutive dates list from first record to today
    const firstDate = new Date(dates[0]);
    const today = new Date();
    
    // Set hours to midnight to compare accurately
    firstDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    
    let tempDate = new Date(firstDate);
    const dateRange = [];
    while (tempDate <= today) {
        dateRange.push(formatDateLocal(tempDate));
        tempDate.setDate(tempDate.getDate() + 1);
    }
    
    let bestStreak = 0;
    let streakCount = 0;
    
    // Calculate best streak historically
    dateRange.forEach(dStr => {
        if (isConsistent(dStr)) {
            streakCount++;
            if (streakCount > bestStreak) {
                bestStreak = streakCount;
            }
        } else {
            streakCount = 0;
        }
    });
    
    // Calculate current streak tracing backwards
    let currentStreak = 0;
    let checkDate = new Date();
    checkDate.setHours(0,0,0,0);
    
    let checkDateStr = formatDateLocal(checkDate);
    
    if (isConsistent(checkDateStr)) {
        // Today is active, trace back starting today
        currentStreak = 1;
        while (true) {
            checkDate.setDate(checkDate.getDate() - 1);
            const prevStr = formatDateLocal(checkDate);
            if (isConsistent(prevStr)) {
                currentStreak++;
            } else {
                break;
            }
        }
    } else {
        // Today is not active. Check if yesterday was active.
        // If yesterday was active, current streak is maintained. Otherwise it's 0.
        checkDate.setDate(checkDate.getDate() - 1);
        const prevStr = formatDateLocal(checkDate);
        if (isConsistent(prevStr)) {
            currentStreak = 1;
            while (true) {
                checkDate.setDate(checkDate.getDate() - 1);
                const prevStrCheck = formatDateLocal(checkDate);
                if (isConsistent(prevStrCheck)) {
                    currentStreak++;
                } else {
                    break;
                }
            }
        } else {
            currentStreak = 0;
        }
    }
    
    return { current: currentStreak, best: bestStreak };
}

function renderReasonInsights() {
    const reasonCounts = {};
    
    Object.values(trackerState.days).forEach(day => {
        if (day.tasks) {
            day.tasks.forEach(task => {
                if (!task.completed && task.reason) {
                    const r = task.reason.trim();
                    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
                }
            });
        }
    });
    
    const reasonList = document.getElementById("reason-list");
    reasonList.innerHTML = "";
    
    const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
    
    if (sortedReasons.length === 0) {
        reasonList.innerHTML = `<li class="empty-state-text">No missed tasks recorded yet. Keep up the high consistency!</li>`;
        return;
    }
    
    sortedReasons.forEach(([reason, count]) => {
        const li = document.createElement("li");
        li.className = "reason-card-item";
        li.innerHTML = `
            <span class="reason-desc-text" title="${escapeHTML(reason)}">${escapeHTML(reason)}</span>
            <span class="reason-count-tag">${count} time${count > 1 ? 's' : ''}</span>
        `;
        reasonList.appendChild(li);
    });
}

// --- HEATMAP GENERATION ---
function renderHeatmap() {
    const grid = document.getElementById("heatmap-grid");
    if (!grid) return;
    grid.innerHTML = "";
    
    // Setup grid: 24 columns, 7 rows.
    // End with the Saturday of the current week to align rows (Sunday -> Saturday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0: Sun, 1: Mon, ... 6: Sat
    const daysUntilSaturday = 6 - dayOfWeek;
    const endGridDate = new Date(today);
    endGridDate.setDate(today.getDate() + daysUntilSaturday);
    
    const totalDays = 24 * 7; // 24 columns * 7 days
    const startGridDate = new Date(endGridDate);
    startGridDate.setDate(endGridDate.getDate() - totalDays + 1);
    
    let curDate = new Date(startGridDate);
    
    for (let i = 0; i < totalDays; i++) {
        const dateStr = formatDateLocal(curDate);
        const dayData = trackerState.days[dateStr];
        
        let completed = 0;
        let total = 0;
        let hours = 0;
        
        if (dayData) {
            hours = dayData.focusedHours || 0;
            if (dayData.tasks) {
                total = dayData.tasks.length;
                completed = dayData.tasks.filter(t => t.completed).length;
            }
        }
        
        // Formula to define activity strength
        const activityScore = (completed * 2) + hours;
        let level = 0;
        if (activityScore > 0) {
            if (activityScore <= 1.5) level = 1;
            else if (activityScore <= 4) level = 2;
            else if (activityScore <= 8) level = 3;
            else level = 4;
        }
        
        const cell = document.createElement("div");
        cell.className = `heatmap-cell lvl-${level}`;
        
        // Tooltip description
        const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        const readableDate = curDate.toLocaleDateString('en-US', dateOptions);
        
        let tip = `${readableDate}: ${hours.toFixed(1)} hrs focused`;
        if (total > 0) {
            tip += `, ${completed}/${total} tasks completed`;
        } else {
            tip += `, 0 tasks`;
        }
        cell.setAttribute("data-tooltip", tip);
        
        // Capture a snapshot variable for click handler
        const clickDate = new Date(curDate);
        cell.addEventListener("click", () => {
            selectDate(clickDate);
        });
        
        grid.appendChild(cell);
        curDate.setDate(curDate.getDate() + 1);
    }
}

// --- CHART.JS MONTHLY INTEGRATION ---
let focusHoursChart = null;

function setupMonthFilterDropdown() {
    const select = document.getElementById("select-graph-month");
    if (!select) return;
    select.innerHTML = "";
    
    // Get list of all months in system + current month
    const months = new Set();
    
    // Add current month
    const now = new Date();
    const curYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    months.add(curYearMonth);
    
    // Scan stored data keys (YYYY-MM-DD)
    Object.keys(trackerState.days).forEach(dateStr => {
        const yrMo = dateStr.substring(0, 7); // extract "YYYY-MM"
        months.add(yrMo);
    });
    
    // Sort months descending (newest first)
    const sortedMonths = Array.from(months).sort().reverse();
    
    sortedMonths.forEach(yrMo => {
        const [yr, mo] = yrMo.split("-");
        const dateObj = new Date(parseInt(yr), parseInt(mo) - 1, 1);
        const name = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        const option = document.createElement("option");
        option.value = yrMo;
        option.textContent = name;
        select.appendChild(option);
    });
    
    // Initial chart draw
    updateCharts();
}

function updateCharts() {
    const select = document.getElementById("select-graph-month");
    if (!select || !select.value) return;
    
    const [year, month] = select.value.split("-").map(Number);
    // Month in JS date: 0-11
    const daysInMonth = new Date(year, month, 0).getDate(); 
    
    const labels = [];
    const focusData = [];
    
    for (let d = 1; d <= daysInMonth; d++) {
        labels.push(d);
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayData = trackerState.days[dateStr];
        focusData.push(dayData ? dayData.focusedHours || 0 : 0);
    }
    
    const ctxEl = document.getElementById("focusHoursChart");
    if (!ctxEl) return;
    const ctx = ctxEl.getContext("2d");
    
    if (focusHoursChart) {
        focusHoursChart.destroy();
    }
    
    focusHoursChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Study Hours',
                data: focusData,
                borderColor: 'rgb(139, 92, 246)', // Violet
                backgroundColor: 'rgba(139, 92, 246, 0.08)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: 'rgb(139, 92, 246)',
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(18, 22, 33, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        title: function(items) {
                            return `${select.selectedOptions[0].text.split(' ')[0]} ${items[0].label}`;
                        },
                        label: function(context) {
                            return `Focus: ${context.parsed.y.toFixed(1)} hrs`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Plus Jakarta Sans', size: 10 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Plus Jakarta Sans', size: 10 }
                    }
                }
            }
        }
    });
}

// --- MODALS BEHAVIOR ---
function showReasonModal(taskId) {
    taskToMarkIncompleteId = taskId;
    
    // Clear previous custom reason field
    document.getElementById("input-custom-reason").value = "";
    
    // De-select preset reasons buttons
    document.querySelectorAll(".btn-preset-reason").forEach(btn => btn.classList.remove("selected"));
    
    // Show modal overlay
    document.getElementById("modal-reason").classList.add("active");
}

function hideReasonModal() {
    document.getElementById("modal-reason").classList.remove("active");
    taskToMarkIncompleteId = null;
}

function showBackupModal(isExportMode) {
    const modal = document.getElementById("modal-backup");
    const title = document.getElementById("backup-modal-title");
    const exportSec = document.getElementById("backup-export-view");
    const importSec = document.getElementById("backup-import-view");
    const confirmBtn = document.getElementById("btn-confirm-import");
    
    modal.classList.add("active");
    
    if (isExportMode) {
        title.textContent = "Export Backup Data";
        exportSec.classList.add("active");
        importSec.classList.remove("active");
        confirmBtn.classList.add("hidden");
        
        // Stringify state data
        const exportData = JSON.stringify(trackerState, null, 2);
        document.getElementById("textarea-export-data").value = exportData;
        
        // Setup download link
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(exportData);
        const downloadLink = document.getElementById("link-download-backup");
        downloadLink.setAttribute("href", dataStr);
        
    } else {
        title.textContent = "Import Backup Data";
        exportSec.classList.remove("active");
        importSec.classList.add("active");
        confirmBtn.classList.remove("hidden");
        
        // Reset input fields
        document.getElementById("textarea-import-data").value = "";
        document.getElementById("input-import-file").value = "";
        document.getElementById("import-file-name").textContent = "No file chosen";
        document.getElementById("import-error-msg").textContent = "";
    }
}

function hideBackupModal() {
    document.getElementById("modal-backup").classList.remove("active");
}

function handleJSONImport() {
    const textarea = document.getElementById("textarea-import-data");
    const errorMsg = document.getElementById("import-error-msg");
    const jsonStr = textarea.value.trim();
    
    if (!jsonStr) {
        errorMsg.textContent = "Please paste JSON or upload a backup file first.";
        return;
    }
    
    try {
        const parsed = JSON.parse(jsonStr);
        
        // Simple schema validation
        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error("Backup file must be a JSON object.");
        }
        if (!parsed.days) {
            throw new Error("Missing 'days' object in tracker state.");
        }
        
        // Overwrite and persist state
        trackerState = parsed;
        if (!trackerState.timer) {
            trackerState.timer = { startTime: null, accumulatedTime: 0, isRunning: false };
        }
        
        saveToLocalStorage();
        loadFromLocalStorage();
        
        // Full dashboard refresh
        selectDate(new Date());
        setupMonthFilterDropdown();
        updateDashboardStats();
        renderHeatmap();
        initTimerFromState();
        
        hideBackupModal();
        alert("Backup imported successfully!");
    } catch (err) {
        errorMsg.textContent = `Invalid JSON format: ${err.message}`;
    }
}

// --- EVENT LISTENERS REGISTRATION ---
function initializeEventListeners() {
    // 1. Task Form Submission
    document.getElementById("form-add-task").addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("input-task-title");
        if (input.value.trim()) {
            addTask(input.value);
            input.value = "";
        }
    });
    
    // 2. Date Navigation
    document.getElementById("btn-prev-day").addEventListener("click", () => {
        const prev = new Date(currentSelectedDate);
        prev.setDate(currentSelectedDate.getDate() - 1);
        selectDate(prev);
    });
    
    document.getElementById("btn-next-day").addEventListener("click", () => {
        const next = new Date(currentSelectedDate);
        next.setDate(currentSelectedDate.getDate() + 1);
        selectDate(next);
    });
    
    // 3. Timer Control Toggles
    document.getElementById("btn-timer-toggle").addEventListener("click", toggleTimer);
    document.getElementById("btn-timer-reset").addEventListener("click", resetTimer);
    
    // 4. Manual Study Hours Log
    document.getElementById("btn-save-manual-hours").addEventListener("click", () => {
        const input = document.getElementById("input-manual-hours");
        const val = parseFloat(input.value);
        if (!isNaN(val) && val > 0) {
            logManualHours(val);
        } else {
            alert("Please enter a valid positive decimal number for focus hours.");
        }
    });
    
    // 5. Month Dropdown Chart Filter
    document.getElementById("select-graph-month").addEventListener("change", updateCharts);
    
    // 6. Reason Modal Preset buttons clicking
    document.querySelectorAll(".btn-preset-reason").forEach(btn => {
        btn.addEventListener("click", (e) => {
            // Unselect others
            document.querySelectorAll(".btn-preset-reason").forEach(b => b.classList.remove("selected"));
            
            // Toggle selected
            e.target.classList.add("selected");
            
            // Sync content with text-area
            document.getElementById("input-custom-reason").value = e.target.getAttribute("data-reason");
        });
    });
    
    // Modal buttons actions
    document.getElementById("btn-submit-reason").addEventListener("click", () => {
        const customText = document.getElementById("input-custom-reason").value.trim();
        if (!customText) {
            alert("Please select a preset reason or write a custom explanation.");
            return;
        }
        if (taskToMarkIncompleteId) {
            saveTaskIncompleteReason(taskToMarkIncompleteId, customText);
            hideReasonModal();
        }
    });
    
    document.getElementById("btn-close-reason-modal").addEventListener("click", hideReasonModal);
    document.getElementById("btn-cancel-reason").addEventListener("click", hideReasonModal);
    
    // 7. Backup Export & Import triggers
    document.getElementById("btn-export").addEventListener("click", () => showBackupModal(true));
    document.getElementById("btn-import").addEventListener("click", () => showBackupModal(false));
    
    document.getElementById("btn-close-backup-modal").addEventListener("click", hideBackupModal);
    document.getElementById("btn-close-backup").addEventListener("click", hideBackupModal);
    
    document.getElementById("btn-confirm-import").addEventListener("click", handleJSONImport);
    
    // File Input Uploader trigger for Import
    document.getElementById("input-import-file").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        document.getElementById("import-file-name").textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById("textarea-import-data").value = event.target.result;
        };
        reader.readAsText(file);
    });
    
    // Clipboard copy action in export modal
    document.getElementById("btn-copy-backup").addEventListener("click", () => {
        const text = document.getElementById("textarea-export-data");
        text.select();
        document.execCommand("copy");
        alert("Backup JSON copied to clipboard!");
    });
}
