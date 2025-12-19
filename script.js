// --- CONFIGURATION ---
const slotsConfig = [
    { index: 3, label: "09:00 - 10:15" },
    { index: 4, label: "10:30 - 11:45" },
    { index: 5, label: "12:00 - 01:15" },
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

// --- 1. COURSE ANALYSIS (Cleaner List) ---
function analyzeCourses(rows) {
    uniqueCourses.clear();
    // Keywords to exclude
    const junkKeywords = ["date", "day", "time", "slot", "classroom", "break", "lunch", "session", "term", "sister", "single", "activity"];
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        slotsConfig.forEach(slot => {
            if (row.length > slot.index) {
                const cellData = row[slot.index];
                if (cellData && cellData.trim().length > 1) {
                    let cleanName = extractCourseName(cellData);
                    
                    if (!cleanName) return;
                    
                    const lower = cleanName.toLowerCase();
                    
                    // 1. Remove specific junk
                    if (junkKeywords.some(kw => lower.includes(kw))) return;
                    
                    // 2. Remove "Academic Office" specifically
                    if (lower.includes("academic office")) return;

                    // 3. Remove Time Ranges (e.g. "9:00 am - 10:15 am")
                    // Checks if string contains digit-colon-digit
                    if (/\d{1,2}:\d{2}/.test(cleanName)) return;

                    // 4. Remove Quiz/Exam from selection list (we match them later)
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
        
        // Add click listener for the div to toggle checkbox
        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                updateCounter(); // Update count on click
            }
        };

        // Add change listener for the input itself
        div.querySelector('input').addEventListener('change', updateCounter);

        container.appendChild(div);
    });

    loading.style.display = 'none';
    container.classList.remove('hidden');
    updateCounter(); // Initial count
}

// --- NEW: Update Counter ---
function updateCounter() {
    const count = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked').length;
    document.getElementById('selection-count').textContent = count;
}

// --- 2. GENERATE LOGIC (Strict Matching) ---
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
                    const type = getEventType(rawText);

                    let isMatch = false;

                    // 1. Exact Course Match
                    if (selectedCourses.includes(cleanName)) isMatch = true;

                    // 2. Quiz/Exam Strict Match
                    // Fix: Ensure "IBS" only matches "IBS" courses, not "IBSCG"
                    if (!isMatch && (type === 'quiz' || type === 'exam')) {
                        const quizBase = cleanName.replace(/^(Quiz-|ET-|MT-)/i, "").trim(); 
                        
                        // We check if any selected course STARTs with the quizBase 
                        // AND is a whole word match (boundary check).
                        // Example: QuizBase="IBS". 
                        // Matches "IBS A", "IBS B".
                        // Does NOT match "IBSCG A".
                        
                        // Regex: Start of string (^), QuizBase, Word Boundary (\b)
                        // Escape special regex chars just in case
                        const safeBase = quizBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp("^" + safeBase + "\\b", "i");

                        if (selectedCourses.some(sc => regex.test(sc))) {
                            isMatch = true;
                        }
                    }

                    if (isMatch) {
                        const contentObj = {
                            text: rawText,
                            room: room,
                            type: type
                        };
                        
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
    renderTable(scheduleMap);
}

function getEventType(text) {
    const lower = text.toLowerCase();
    if (lower.startsWith("quiz")) return 'quiz';
    if (lower.startsWith("et-") || lower.startsWith("mt-") || lower.includes("end term") || lower.includes("mid term")) return 'exam';
    if (lower.includes("republic") || lower.includes("holiday")) return 'holiday';
    return 'class';
}

function renderTable(scheduleMap) {
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    const sortedDates = Array.from(scheduleMap.keys()).sort();

    let headerHTML = `<th class="bg-gray-100 text-gray-700 p-3 sticky left-0 z-10 border border-gray-300 shadow-sm min-w-[100px]">Date</th>`;
    slotsConfig.forEach(slot => {
        headerHTML += `<th class="bg-gray-50 text-gray-600 p-2 text-xs uppercase tracking-wider border border-gray-300 min-w-[140px]">${slot.label}</th>`;
    });
    tableHeader.innerHTML = headerHTML;

    let bodyHTML = "";
    sortedDates.forEach(dateKey => {
        const dayData = scheduleMap.get(dateKey);
        const isEmptyDay = Object.keys(dayData).length === 0;

        const [y, m, d] = dateKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        let rowHTML = `<tr class="hover:bg-gray-50 transition-colors">`;
        rowHTML += `<td class="p-3 bg-white font-bold text-gray-800 border-b border-r border-gray-300 sticky left-0 z-10 whitespace-nowrap shadow-sm">${dateDisplay}</td>`;

        if (isEmptyDay) {
            rowHTML += `<td colspan="${slotsConfig.length}" class="p-3 border-b border-gray-200 text-center free-day">
                ✨ Hey, you are free today! Enjoy your time off. ✨
            </td>`;
        } else {
            slotsConfig.forEach(slot => {
                const events = dayData[slot.index];
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
                            <div class="${badgeClass} p-2 rounded text-left shadow-sm">
                                <div class="font-bold text-sm leading-tight">${evt.text}</div>
                                ${evt.room ? `<div class="text-xs opacity-75 mt-1">📍 ${evt.room}</div>` : ''}
                            </div>
                        `;
                    });
                }
                rowHTML += `<td class="p-2 border-b border-r ${cellClass} align-top text-center h-full">${cellHTML}</td>`;
            });
        }
        rowHTML += `</tr>`;
        bodyHTML += rowHTML;
    });
    tableBody.innerHTML = bodyHTML;
    
    document.getElementById('selection-page').classList.add('hidden');
    document.getElementById('schedule-page').classList.remove('hidden');
}

function downloadCSV() {
    if (!currentScheduleMap) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    
    let headerRow = ["Date"];
    slotsConfig.forEach(s => headerRow.push(s.label));
    csvContent += headerRow.join(",") + "\r\n";

    const sortedDates = Array.from(currentScheduleMap.keys()).sort();
    sortedDates.forEach(dateKey => {
        const dayData = currentScheduleMap.get(dateKey);
        const isEmpty = Object.keys(dayData).length === 0;
        let row = [dateKey];

        if (isEmpty) {
            slotsConfig.forEach(() => row.push("FREE"));
        } else {
            slotsConfig.forEach(slot => {
                const events = dayData[slot.index];
                if (events) {
                    const text = events.map(e => `${e.text} (${e.room})`).join(" | ");
                    row.push(`"${text}"`); 
                } else {
                    row.push("");
                }
            });
        }
        csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "my_timetable.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
