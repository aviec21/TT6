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

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof Papa === 'undefined') {
        alert("Critical Error: PapaParse library not loaded. Check index.html.");
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

// --- CORE LOGIC ---
function analyzeCourses(rows) {
    try {
        uniqueCourses.clear();
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            slotsConfig.forEach(slot => {
                if (row.length > slot.index) {
                    const cellData = row[slot.index];
                    if (cellData && cellData.trim().length > 1) {
                        const courseName = extractCourseName(cellData);
                        if (courseName) uniqueCourses.add(courseName);
                    }
                }
            });
        }
        renderCheckboxes();
    } catch (e) {
        console.error(e);
        alert("Error analyzing courses: " + e.message);
    }
}

function extractCourseName(rawText) {
    if (!rawText) return null;
    rawText = rawText.replace(/\s+/g, ' ').trim();
    const lower = rawText.toLowerCase();
    
    // Filter out junk
    if (lower.includes("registration") || lower.includes("lunch") || lower.includes("break")) return null;
    
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
    
    if (uniqueCourses.size === 0) {
        loading.innerHTML = "No courses found. Is the CSV empty?";
        return;
    }

    container.innerHTML = "";
    const sortedCourses = Array.from(uniqueCourses).sort();

    sortedCourses.forEach(course => {
        const div = document.createElement('div');
        div.className = "flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer transition select-none";
        div.innerHTML = `
            <input type="checkbox" id="${course}" value="${course}" class="w-5 h-5 text-indigo-600 rounded cursor-pointer">
            <label for="${course}" class="ml-3 text-sm font-medium text-gray-900 cursor-pointer w-full">${course}</label>
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

// --- GENERATE BUTTON ---
function generateSchedule() {
    try {
        const checkboxes = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked');
        const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

        if (selectedCourses.length === 0) {
            alert("Please select at least one course.");
            return;
        }

        const scheduleMap = new Map(); // Key: "YYYY-MM-DD"
        let lastValidDate = null;

        for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            const dateStr = row[0];

            // 1. DATE PARSING FIX
            let formattedDate = null;
            if (dateStr && (dateStr.includes("-") || dateStr.includes("/"))) {
                formattedDate = normalizeDate(dateStr);
                // Only update lastValidDate if we successfully parsed a new date
                if (formattedDate) lastValidDate = formattedDate;
            } else if (lastValidDate && hasData(row)) {
                // Fill down logic
                formattedDate = lastValidDate;
            }

            if (!formattedDate) continue;

            const room = row[1] || "Unknown Room";

            // 2. SCAN SLOTS
            slotsConfig.forEach(slot => {
                if (row.length > slot.index) {
                    const cellData = row[slot.index];
                    if (cellData && cellData.trim().length > 1) {
                        const courseName = extractCourseName(cellData);
                        
                        if (selectedCourses.includes(courseName)) {
                            if (!scheduleMap.has(formattedDate)) {
                                scheduleMap.set(formattedDate, {});
                            }
                            const dateEntry = scheduleMap.get(formattedDate);
                            
                            const displayText = `<div class="font-bold text-indigo-700 text-sm">${cellData.trim()}</div><div class="text-xs text-gray-500 mt-1">${room}</div>`;
                            
                            if (dateEntry[slot.index]) {
                                dateEntry[slot.index] += `<div class="my-1 border-t border-gray-200"></div>` + displayText;
                            } else {
                                dateEntry[slot.index] = displayText;
                            }
                        }
                    }
                }
            });
        }

        renderTable(scheduleMap);

    } catch (err) {
        alert("Error: " + err.message);
        console.error(err);
    }
}

function renderTable(scheduleMap) {
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    const sortedDates = Array.from(scheduleMap.keys()).sort();

    if (sortedDates.length === 0) {
        alert("No classes found for these selections.");
        return;
    }

    // Build Headers
    let headerHTML = `<th class="bg-gray-100 text-gray-700 p-3 sticky left-0 z-10 border border-gray-300 shadow-sm min-w-[100px]">Date</th>`;
    slotsConfig.forEach(slot => {
        headerHTML += `<th class="bg-gray-50 text-gray-600 p-2 text-xs uppercase tracking-wider border border-gray-300 min-w-[140px]">${slot.label}</th>`;
    });
    tableHeader.innerHTML = headerHTML;

    // Build Rows
    let bodyHTML = "";
    sortedDates.forEach(dateKey => {
        const dayData = scheduleMap.get(dateKey);
        
        // Format Date nicely
        // dateKey is YYYY-MM-DD. We construct date manually to avoid timezone shifts
        const [y, m, d] = dateKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        let rowHTML = `<tr class="hover:bg-gray-50">`;
        rowHTML += `<td class="p-3 bg-white font-bold text-gray-800 border-b border-r border-gray-300 sticky left-0 z-10 whitespace-nowrap shadow-sm">${dateDisplay}</td>`;

        slotsConfig.forEach(slot => {
            const content = dayData[slot.index] || "";
            // Highlight cells that have content
            const bgClass = content ? "bg-indigo-50 border-indigo-100" : "border-gray-200";
            rowHTML += `<td class="p-2 border-b border-r ${bgClass} align-top text-center">${content}</td>`;
        });

        rowHTML += `</tr>`;
        bodyHTML += rowHTML;
    });

    tableBody.innerHTML = bodyHTML;

    // Switch View
    document.getElementById('selection-page').classList.add('hidden');
    document.getElementById('schedule-page').classList.remove('hidden');
}

// --- FIXED DATE PARSER ---
function normalizeDate(str) {
    if (!str) return null;
    str = str.trim();
    
    // 1. Try ISO Format (2025-12-15)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const parts = str.split(/[\/\-]/);
    
    if (parts.length === 3) {
        let p0 = parseInt(parts[0]);
        let p1 = parseInt(parts[1]);
        let p2 = parseInt(parts[2]);

        // Case: MM/DD/YYYY or DD/MM/YYYY (e.g., 12/15/2025)
        if (parts[2].length === 4) {
            // Heuristic: If 2nd number > 12, it must be the Day. (Format: MM/DD/YYYY)
            // Example: 12/15/2025 -> Month 12, Day 15
            if (p1 > 12) {
                return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }
            // Heuristic: If 1st number > 12, it must be the Day. (Format: DD/MM/YYYY)
            if (p0 > 12) {
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
            
            // Ambiguous (e.g. 12/05/2025). Default to US Format (MM/DD/YYYY) based on your file
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
