// --- CONFIGURATION ---
const slotsConfig = [
    { index: 3, label: "09:00 - 10:15" },
    { index: 4, label: "10:30 - 11:45" },
    { index: 5, label: "12:00 - 01:15" },
    { index: 6, label: "01:30 - 02:15" }, // NEW: Lunch Slot for Quizzes
    { index: 7, label: "02:30 - 03:45" },
    { index: 8, label: "04:00 - 05:15" },
    { index: 9, label: "05:30 - 06:45" },
    { index: 10, label: "07:00 - 08:15" },
    { index: 11, label: "08:45 - 10:00" },
    { index: 12, label: "10:15 - 11:30" }
];

let rawData = [];
let uniqueCourses = new Set();
let currentScheduleMap = null; 
let currentViewMode = 'week'; 
let currentDatePointer = new Date(); 

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof Papa === 'undefined') {
        alert("Critical Error: PapaParse library not loaded.");
        return;
    }

    Papa.parse("timetable.csv", {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function(results) {
            console.log("CSV Loaded. Rows found:", results.data.length);
            rawData = results.data;
            analyzeCourses(rawData);
        },
        error: function(err) {
            document.getElementById('loading').innerHTML = `<span style="color:red">Error: ${err.message}</span>`;
        }
    });
});

// --- 1. COURSE ANALYSIS ---
function analyzeCourses(rows) {
    uniqueCourses.clear();
    // Removed "lunch" from junk to allow Lunch Quizzes
    const junkKeywords = ["date", "day", "time", "slot", "classroom", "session", "term", "sister", "single", "activity"];
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        slotsConfig.forEach(slot => {
            if (row.length > slot.index) {
                const cellData = row[slot.index];
                if (cellData && cellData.trim().length > 1) {
                    let cleanName = extractCourseName(cellData);
                    if (!cleanName) return;
                    
                    const lower = cleanName.toLowerCase();
                    if (junkKeywords.some(kw => lower.includes(kw))) return;
                    if (lower.includes("academic office")) return;
                    if (/\d{1,2}:\d{2}/.test(cleanName)) return; // Remove time strings
                    if (lower.startsWith("quiz") || lower.startsWith("et-") || lower.startsWith("mt-")) return;
                    if (lower.includes("registration") || lower.includes("republic")) return;

                    uniqueCourses.add(cleanName);
                }
            }
        });
    }
    renderCheckboxes();
}

function extractCourseName(rawText) {
    if (!rawText) return null;
    rawText = rawText.replace(/\s+/g, ' ').trim();
    
    // Ignore pure "Lunch" or "Break" text
    const lower = rawText.toLowerCase();
    if (lower === "lunch" || lower === "break") return null;

    let parts = rawText.split(" ");
    if (parts.length > 1 && !isNaN(parts[parts.length - 1])) {
        parts.pop();
    }
    return parts.join(" ");
}

function renderCheckboxes() {
    const container = document.getElementById('checkbox-container');
    const loading = document.getElementById('loading');
    container.innerHTML = "";
    const sortedCourses = Array.from(uniqueCourses).sort();
    const savedSelection = JSON.parse(localStorage.getItem('my_timetable_courses') || "[]");

    sortedCourses.forEach(course => {
        const isChecked = savedSelection.includes(course) ? "checked" : "";
        const div = document.createElement('div');
        div.className = "flex items-center p-2 border rounded hover:bg-gray-50 cursor-pointer select-none bg-white shadow-sm";
        div.innerHTML = `
            <input type="checkbox" id="${course}" value="${course}" ${isChecked} class="w-4 h-4 text-indigo-600 rounded cursor-pointer">
            <label for="${course}" class="ml-2 text-sm font-medium text-gray-700 cursor-pointer w-full">${course}</label>
        `;
        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                updateCounter();
            }
        };
        div.querySelector('input').addEventListener('change', updateCounter);
        container.appendChild(div);
    });

    loading.style.display = 'none';
    container.classList.remove('hidden');
    updateCounter();
}

function updateCounter() {
    const count = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked').length;
    document.getElementById('selection-count').textContent = count;
}

// --- 2. GENERATE LOGIC ---
function generateSchedule() {
    const checkboxes = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked');
    const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

    if (selectedCourses.length === 0) {
        alert("Please select at least one course.");
        return;
    }

    localStorage.setItem('my_timetable_courses', JSON.stringify(selectedCourses));

    const scheduleMap = new Map(); 
    let lastValidDate = null;

    for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const dateStr = row[0];

        let formattedDate = null;
        if (dateStr && (dateStr.includes("-") || dateStr.includes("/"))) {
            formattedDate = normalizeDate(dateStr);
            if (formattedDate) lastValidDate = formattedDate;
        } else if (lastValidDate && hasData(row)) {
            formattedDate = lastValidDate;
        }

        if (!formattedDate) continue;

        if (!scheduleMap.has(formattedDate)) {
            scheduleMap.set(formattedDate, {});
        }
        const dateEntry = scheduleMap.get(formattedDate);
        const room = row[1] || "";

        slotsConfig.forEach(slot => {
            if (row.length > slot.index) {
                const cellData = row[slot.index];
                if (cellData && cellData.trim().length > 1) {
                    const rawText = cellData.trim();
                    const cleanName = extractCourseName(rawText);
                    if (!cleanName) return; // Skip "Lunch" text

                    const type = getEventType(rawText);
                    let isMatch = false;

                    if (selectedCourses.includes(cleanName)) isMatch = true;

                    if (!isMatch && (type === 'quiz' || type === 'exam')) {
                        const quizBase = cleanName.replace(/^(Quiz-|ET-|MT-)/i, "").trim(); 
                        const safeBase = quizBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp("^" + safeBase + "\\b", "i");
                        if (selectedCourses.some(sc => regex.test(sc))) {
                            isMatch = true;
                        }
                    }

                    if (isMatch) {
                        // REMOVE VENUE FOR QUIZZES/EXAMS
                        const finalRoom = (type === 'quiz' || type === 'exam') ? "" : room;

                        const contentObj = { text: rawText, room: finalRoom, type: type };
                        if (dateEntry[slot.index]) {
                            dateEntry[slot.index].push(contentObj);
                        } else {
                            dateEntry[slot.index] = [contentObj];
                        }
                    }
                }
            }
        });
    }

    currentScheduleMap = scheduleMap;
    currentDatePointer = new Date(); 
    
    document.getElementById('selection-page').classList.add('hidden');
    document.getElementById('schedule-page').classList.remove('hidden');
    
    renderCurrentView();
}

function getEventType(text) {
    const lower = text.toLowerCase();
    if (lower.startsWith("quiz")) return 'quiz';
    if (lower.startsWith("et-") || lower.startsWith("mt-") || lower.includes("end term") || lower.includes("mid term")) return 'exam';
    if (lower.includes("republic") || lower.includes("holiday")) return 'holiday';
    return 'class';
}

// --- 3. VIEW & NAVIGATION ---

function switchView(mode) {
    currentViewMode = mode;
    const btnWeek = document.getElementById('btn-week');
    const btnMonth = document.getElementById('btn-month');
    
    if (mode === 'week') {
        btnWeek.className = "px-4 py-1 rounded-md text-sm font-bold transition active-view shadow-sm";
        btnMonth.className = "px-4 py-1 rounded-md text-sm font-bold transition inactive-view hover:bg-gray-200";
    } else {
        btnMonth.className = "px-4 py-1 rounded-md text-sm font-bold transition active-view shadow-sm";
        btnWeek.className = "px-4 py-1 rounded-md text-sm font-bold transition inactive-view hover:bg-gray-200";
    }
    renderCurrentView();
}

function navigate(direction) {
    if (currentViewMode === 'week') {
        currentDatePointer.setDate(currentDatePointer.getDate() + (direction * 7));
    } else {
        currentDatePointer.setMonth(currentDatePointer.getMonth() + direction);
        currentDatePointer.setDate(1);
    }
    renderCurrentView();
}

function goToToday() {
    currentDatePointer = new Date();
    renderCurrentView();
}

function renderCurrentView() {
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    const title = document.getElementById('calendar-title');

    let headerHTML = `<th class="bg-gray-100 text-gray-700 p-3 sticky left-0 z-10 border border-gray-300 shadow-sm min-w-[100px]">Date</th>`;
    slotsConfig.forEach(slot => {
        headerHTML += `<th class="bg-gray-50 text-gray-600 p-2 text-xs uppercase tracking-wider border border-gray-300 min-w-[140px]">${slot.label}</th>`;
    });
    tableHeader.innerHTML = headerHTML;

    // Filter Dates
    let datesToRender = [];
    const allDates = Array.from(currentScheduleMap.keys()).sort();

    if (currentViewMode === 'week') {
        const day = currentDatePointer.getDay();
        const diff = currentDatePointer.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(currentDatePointer);
        monday.setDate(diff);
        
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            datesToRender.push(toISODate(d));
        }

        const endWeek = new Date(monday);
        endWeek.setDate(monday.getDate() + 6);
        title.textContent = `${monday.toLocaleDateString('en-US', {month:'short', day:'numeric'})} - ${endWeek.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}`;

    } else {
        const y = currentDatePointer.getFullYear();
        const m = currentDatePointer.getMonth();
        datesToRender = allDates.filter(isoDate => {
            const [dy, dm, dd] = isoDate.split('-').map(Number);
            return dy === y && (dm - 1) === m;
        });
        title.textContent = currentDatePointer.toLocaleDateString('en-US', {month:'long', year:'numeric'});
    }

    // Render Body
    let bodyHTML = "";
    
    datesToRender.forEach(dateKey => {
        const dayData = currentScheduleMap.get(dateKey) || {};
        const isEmptyDay = Object.keys(dayData).length === 0;

        const [y, m, d] = dateKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const isToday = toISODate(new Date()) === dateKey;
        const dateClass = isToday ? "bg-indigo-600 text-white" : "bg-white text-gray-800";
        const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        let rowHTML = `<tr class="hover:bg-gray-50 transition-colors">`;
        rowHTML += `<td class="p-3 ${dateClass} font-bold border-b border-r border-gray-300 sticky left-0 z-10 whitespace-nowrap shadow-sm">
            ${dateDisplay} ${isToday ? '<span class="text-xs bg-white text-indigo-600 px-1 rounded ml-1">Today</span>' : ''}
        </td>`;

        if (isEmptyDay) {
            rowHTML += `<td colspan="${slotsConfig.length}" class="p-3 border-b border-gray-200 text-center free-day text-xs">
                ✨ Free Day ✨
            </td>`;
        } else {
            // MERGE & RENDER SLOTS
            for (let i = 0; i < slotsConfig.length; i++) {
                const slot = slotsConfig[i];
                const events = dayData[slot.index];
                
                // --- MERGE LOGIC ---
                // Calculate colspan if next slot has IDENTICAL events
                let colspan = 1;
                while (i + colspan < slotsConfig.length) {
                    const nextSlot = slotsConfig[i + colspan];
                    const nextEvents = dayData[nextSlot.index];
                    if (areEventsIdentical(events, nextEvents)) {
                        colspan++;
                    } else {
                        break;
                    }
                }

                let cellClass = "border-gray-200"; 
                let cellHTML = "";

                if (events && events.length > 0) {
                    cellClass = "bg-white border-gray-300";
                    events.forEach((evt, idx) => {
                        if (idx > 0) cellHTML += `<div class="my-1 border-t border-gray-200"></div>`;
                        let badgeClass = "evt-class";
                        if (evt.type === 'quiz') badgeClass = "evt-quiz";
                        if (evt.type === 'exam') badgeClass = "evt-exam";
                        if (evt.type === 'holiday') badgeClass = "evt-holiday";

                        cellHTML += `
                            <div class="${badgeClass} p-1 rounded text-left shadow-sm mb-1 h-full">
                                <div class="font-bold text-xs leading-tight">${evt.text}</div>
                                ${evt.room ? `<div class="text-[10px] opacity-75">📍 ${evt.room}</div>` : ''}
                            </div>
                        `;
                    });
                }
                
                // Add cell with colspan
                rowHTML += `<td colspan="${colspan}" class="p-1 border-b border-r ${cellClass} align-top text-center h-full min-w-[120px]">${cellHTML}</td>`;
                
                // Skip the merged slots in the loop
                i += (colspan - 1);
            }
        }
        rowHTML += `</tr>`;
        bodyHTML += rowHTML;
    });

    if (bodyHTML === "") {
        bodyHTML = `<tr><td colspan="10" class="p-8 text-center text-gray-400 italic">No classes scheduled for this period.</td></tr>`;
    }

    tableBody.innerHTML = bodyHTML;
}

// --- HELPER: Compare Events for Merging ---
function areEventsIdentical(ev1, ev2) {
    if (!ev1 || !ev2) return false; // One is empty
    if (ev1.length !== ev2.length) return false;
    // Compare each event text in the array
    for (let k = 0; k < ev1.length; k++) {
        if (ev1[k].text !== ev2[k].text) return false;
    }
    return true;
}

// --- UTILS ---
function toISODate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeDate(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
        let p0 = parseInt(parts[0]), p1 = parseInt(parts[1]), p2 = parseInt(parts[2]);
        if (parts[2].length === 4) {
             if (p1 > 12) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
             return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
    }
    return null;
}

function hasData(row) {
    for (let slot of slotsConfig) {
        if (row[slot.index] && row[slot.index].trim().length > 1) return true;
    }
    return false;
}

function goBack() {
    document.getElementById('schedule-page').classList.add('hidden');
    document.getElementById('selection-page').classList.remove('hidden');
}

function clearSelection() {
    localStorage.removeItem('my_timetable_courses');
    const checkboxes = document.querySelectorAll('#checkbox-container input');
    checkboxes.forEach(cb => cb.checked = false);
    updateCounter();
}

function downloadCSV() {
    if (!currentScheduleMap) {
        alert("Please generate the schedule first.");
        return;
    }

    const timeMap = {
        3: { s: "09:00 AM", e: "10:15 AM" },
        4: { s: "10:30 AM", e: "11:45 AM" },
        5: { s: "12:00 PM", e: "01:15 PM" },
        6: { s: "01:30 PM", e: "02:15 PM" }, // Added Lunch Slot
        7: { s: "02:30 PM", e: "03:45 PM" },
        8: { s: "04:00 PM", e: "05:15 PM" },
        9: { s: "05:30 PM", e: "06:45 PM" },
        10: { s: "07:00 PM", e: "08:15 PM" },
        11: { s: "08:45 PM", e: "10:00 PM" },
        12: { s: "10:15 PM", e: "11:30 PM" }
    };

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Subject,Start Date,Start Time,End Date,End Time,Location,Description\r\n";

    const sortedDates = Array.from(currentScheduleMap.keys()).sort();

    sortedDates.forEach(dateKey => {
        const dayData = currentScheduleMap.get(dateKey);
        
        Object.keys(dayData).forEach(slotIndex => {
            const events = dayData[slotIndex];
            const times = timeMap[slotIndex];

            if (events && events.length > 0 && times) {
                events.forEach(evt => {
                    const subject = evt.text.replace(/,/g, " "); 
                    const location = evt.room ? evt.room.replace(/,/g, " ") : "";
                    
                    let description = "Class Session";
                    if (evt.type === 'quiz') description = "Quiz / Assessment";
                    if (evt.type === 'exam') description = "End Term / Mid Term Exam";
                    if (evt.type === 'holiday') description = "Holiday";

                    let row = [
                        `"${subject}"`,
                        dateKey,
                        `"${times.s}"`,
                        dateKey,
                        `"${times.e}"`,
                        `"${location}"`,
                        `"${description}"`
                    ];
                    csvContent += row.join(",") + "\r\n";
                });
            }
        });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "timetable_gcal.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
