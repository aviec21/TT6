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
let currentScheduleMap = null; // Stores the generated schedule for CSV export

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

// --- 1. COURSE ANALYSIS (Clean List) ---
function analyzeCourses(rows) {
    uniqueCourses.clear();
    const junkKeywords = ["date", "day", "time", "slot", "classroom", "break", "lunch", "session", "term", "sister", "single"];
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        slotsConfig.forEach(slot => {
            if (row.length > slot.index) {
                const cellData = row[slot.index];
                if (cellData && cellData.trim().length > 1) {
                    let cleanName = extractCourseName(cellData);
                    
                    // Filter Logic:
                    if (!cleanName) return;
                    
                    const lower = cleanName.toLowerCase();
                    
                    // 1. Remove Junk (Headers)
                    if (junkKeywords.some(kw => lower.includes(kw))) return;

                    // 2. Remove "Quiz-" or "ET-" from the LIST options (we auto-match them later)
                    if (lower.startsWith("quiz") || lower.startsWith("et-") || lower.startsWith("mt-")) return;
                    
                    // 3. Ignore specific non-courses
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
    // Remove last part if it is a number (Session ID)
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

    // RESTORE SELECTION
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
            }
        };
        container.appendChild(div);
    });

    loading.style.display = 'none';
    container.classList.remove('hidden');
}

// --- 2. GENERATE LOGIC ---
function generateSchedule() {
    const checkboxes = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked');
    const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

    if (selectedCourses.length === 0) {
        alert("Please select at least one course.");
        return;
    }

    // SAVE SELECTION
    localStorage.setItem('my_timetable_courses', JSON.stringify(selectedCourses));

    const scheduleMap = new Map(); 
    let lastValidDate = null;

    // Scan rows
    for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const dateStr = row[0];

        // Date Logic (Fill Down)
        let formattedDate = null;
        if (dateStr && (dateStr.includes("-") || dateStr.includes("/"))) {
            formattedDate = normalizeDate(dateStr);
            if (formattedDate) lastValidDate = formattedDate;
        } else if (lastValidDate && hasData(row)) {
            formattedDate = lastValidDate;
        }

        if (!formattedDate) continue;

        // Init Day in Map (Even if empty, so we track all dates)
        if (!scheduleMap.has(formattedDate)) {
            scheduleMap.set(formattedDate, {});
        }
        const dateEntry = scheduleMap.get(formattedDate);
        const room = row[1] || "";

        // Slot Logic
        slotsConfig.forEach(slot => {
            if (row.length > slot.index) {
                const cellData = row[slot.index];
                if (cellData && cellData.trim().length > 1) {
                    const rawText = cellData.trim();
                    const cleanName = extractCourseName(rawText); // e.g. "BFSI A" or "Quiz-BFSI"
                    const type = getEventType(rawText); // 'class', 'quiz', 'exam'

                    // MATCHING LOGIC
                    let isMatch = false;

                    // 1. Direct Match (e.g. "BFSI A" selected -> "BFSI A" cell)
                    if (selectedCourses.includes(cleanName)) isMatch = true;

                    // 2. Prefix Match for Quizzes (e.g. "BFSI A" selected -> "Quiz-BFSI" cell)
                    if (!isMatch && (type === 'quiz' || type === 'exam')) {
                        // Check if any selected course starts with the Quiz's base name
                        // e.g. Quiz Base: "BFSI". Selected: "BFSI A". "BFSI A".startsWith("BFSI") -> True
                        
                        // Extract base from Quiz (Quiz-BFSI -> BFSI)
                        const quizBase = cleanName.replace(/^(Quiz-|ET-|MT-)/i, "").trim(); 
                        
                        // Does this quiz belong to a selected course?
                        // We check if the selected course includes the quiz base code
                        if (selectedCourses.some(sc => sc.includes(quizBase))) {
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

    currentScheduleMap = scheduleMap; // Save for CSV export
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

    // Headers
    let headerHTML = `<th class="bg-gray-100 text-gray-700 p-3 sticky left-0 z-10 border border-gray-300 shadow-sm min-w-[100px]">Date</th>`;
    slotsConfig.forEach(slot => {
        headerHTML += `<th class="bg-gray-50 text-gray-600 p-2 text-xs uppercase tracking-wider border border-gray-300 min-w-[140px]">${slot.label}</th>`;
    });
    tableHeader.innerHTML = headerHTML;

    // Body
    let bodyHTML = "";
    
    sortedDates.forEach(dateKey => {
        const dayData = scheduleMap.get(dateKey);
        const isEmptyDay = Object.keys(dayData).length === 0;

        // Date Display
        const [y, m, d] = dateKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        let rowHTML = `<tr class="hover:bg-gray-50 transition-colors">`;
        rowHTML += `<td class="p-3 bg-white font-bold text-gray-800 border-b border-r border-gray-300 sticky left-0 z-10 whitespace-nowrap shadow-sm">${dateDisplay}</td>`;

        if (isEmptyDay) {
            // MERGED "FREE DAY" ROW
            rowHTML += `<td colspan="${slotsConfig.length}" class="p-3 border-b border-gray-200 text-center free-day">
                ✨ Hey, you are free today! Enjoy your time off. ✨
            </td>`;
        } else {
            // Regular Slots
            slotsConfig.forEach(slot => {
                const events = dayData[slot.index];
                let cellHTML = "";
                let cellClass = "border-gray-200"; // Default empty

                if (events && events.length > 0) {
                    cellClass = "bg-white border-gray-300";
                    events.forEach((evt, idx) => {
                        if (idx > 0) cellHTML += `<div class="my-1 border-t border-gray-200"></div>`;
                        
                        // Style based on type
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

// --- 3. CSV DOWNLOAD ---
function downloadCSV() {
    if (!currentScheduleMap) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Header Row
    let headerRow = ["Date"];
    slotsConfig.forEach(s => headerRow.push(s.label));
    csvContent += headerRow.join(",") + "\r\n";

    // Data Rows
    const sortedDates = Array.from(currentScheduleMap.keys()).sort();
    sortedDates.forEach(dateKey => {
        const dayData = currentScheduleMap.get(dateKey);
        const isEmpty = Object.keys(dayData).length === 0;
        
        // Date Col
        let row = [dateKey];

        if (isEmpty) {
            // Just leave slots empty
            slotsConfig.forEach(() => row.push("FREE"));
        } else {
            slotsConfig.forEach(slot => {
                const events = dayData[slot.index];
                if (events) {
                    // Combine multiple events in one cell with " | "
                    const text = events.map(e => `${e.text} (${e.room})`).join(" | ");
                    // Escape commas for CSV
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

// --- UTILS ---
function normalizeDate(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
        let p0 = parseInt(parts[0]), p1 = parseInt(parts[1]), p2 = parseInt(parts[2]);
        if (parts[2].length === 4) { // MM/DD/YYYY or DD/MM/YYYY
             if (p1 > 12) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`; // US
             return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`; // Default US
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
}
