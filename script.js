let allEvents = [];
let uniqueCourses = new Set();
let calendar;

// MAPPING: Columns to Time Slots
const timeSlots = {
    3: { start: "09:00", end: "10:15" },
    4: { start: "10:30", end: "11:45" },
    5: { start: "12:00", end: "13:15" },
    // 6 is Lunch
    7: { start: "14:30", end: "15:45" },
    8: { start: "16:00", end: "17:15" },
    9: { start: "17:30", end: "18:45" },
    10: { start: "19:00", end: "20:15" },
    11: { start: "20:45", end: "22:00" },
    12: { start: "22:15", end: "23:30" }
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Show Debug Box
    const debugBox = document.createElement('div');
    debugBox.id = "debug-log";
    debugBox.className = "bg-gray-100 p-4 m-4 border border-red-300 text-xs font-mono text-red-600 overflow-auto h-48";
    debugBox.innerHTML = "<strong>System Status:</strong> Initializing...<br>";
    document.body.prepend(debugBox);

    function log(msg) {
        debugBox.innerHTML += `> ${msg}<br>`;
        console.log(msg);
    }

    log("Fetching timetable.csv...");

    Papa.parse("timetable.csv", {
        download: true,
        header: false,
        skipEmptyLines: true,
        complete: function(results) {
            log(`File loaded! Found ${results.data.length} rows.`);
            
            // Print first 5 rows to check format
            log("--- PREVIEW OF FIRST 5 ROWS ---");
            results.data.slice(0, 5).forEach((row, i) => log(`Row ${i}: ${JSON.stringify(row)}`));
            log("-------------------------------");

            if (results.data.length === 0) {
                log("ERROR: File is empty.");
                return;
            }
            processData(results.data, log);
        },
        error: function(err) {
            log(`CRITICAL ERROR: ${err.message}`);
        }
    });
});

function processData(rows, log) {
    let coursesFound = 0;

    // Scan all rows (we auto-detect where data starts)
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let dateStr = row[0]; // First column

        if (!dateStr) continue;

        // 2. SMART DATE PARSING
        // Convert 15/12/2025 or 15-12-2025 -> 2025-12-15
        const formattedDate = normalizeDate(dateStr);

        if (!formattedDate) {
            // If it's not a date, it's likely a header or junk row. Skip silently.
            continue;
        }

        const room = row[1]; // Second column

        // Loop through time columns
        for (const [colIndex, time] of Object.entries(timeSlots)) {
            const cellData = row[colIndex];
            
            if (cellData && cellData.trim() !== "") {
                const rawText = cellData.trim();
                
                // Logic: "BFSI A 1" -> "BFSI A"
                let parts = rawText.split(" ");
                if (parts.length > 1 && !isNaN(parts[parts.length - 1])) {
                    parts.pop();
                }
                let courseIdentifier = parts.join(" ");

                // Filter out common keywords if needed
                if (courseIdentifier.toLowerCase().includes("registration")) continue;

                uniqueCourses.add(courseIdentifier);
                coursesFound++;

                allEvents.push({
                    title: `${rawText} (${room})`,
                    start: `${formattedDate}T${time.start}:00`,
                    end: `${formattedDate}T${time.end}:00`,
                    extendedProps: { courseId: courseIdentifier }
                });
            }
        }
    }

    log(`Scan complete. Found ${coursesFound} events and ${uniqueCourses.size} unique courses.`);
    
    if (uniqueCourses.size === 0) {
        log("WARNING: 0 courses found. Check if the column indices in 'timeSlots' match your CSV columns.");
    } else {
        // Hide debug box if successful (optional, currently keeping it visible to be safe)
        // document.getElementById('debug-log').style.display = 'none';
        renderCheckboxes();
    }
}

// Helper: Turns any date format into YYYY-MM-DD
function normalizeDate(str) {
    str = str.trim();
    // 1. Check for YYYY-MM-DD (Standard)
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;

    // 2. Check for DD/MM/YYYY or DD-MM-YYYY (Excel default)
    // Matches 15/12/2025 or 15-12-2025
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
        const p1 = parts[0];
        const p2 = parts[1];
        const p3 = parts[2];

        // If last part is year (e.g. 2025)
        if (p3.length === 4) {
            return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        }
    }
    return null; // Not a valid date
}

function renderCheckboxes() {
    const container = document.getElementById('checkbox-container');
    const loading = document.getElementById('loading');
    
    const sortedCourses = Array.from(uniqueCourses).sort();
    container.innerHTML = "";

    sortedCourses.forEach(course => {
        const div = document.createElement('div');
        div.className = "flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer transition";
        div.innerHTML = `
            <input type="checkbox" id="${course}" value="${course}" class="w-5 h-5 text-indigo-600 rounded cursor-pointer">
            <label for="${course}" class="ml-3 text-sm font-medium text-gray-900 cursor-pointer w-full select-none">${course}</label>
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

// Page Navigation
function showCalendar() {
    const checkboxes = document.querySelectorAll('#checkbox-container input[type="checkbox"]:checked');
    const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

    if (selectedCourses.length === 0) {
        alert("Please select at least one course.");
        return;
    }

    const filteredEvents = allEvents.filter(event => 
        selectedCourses.includes(event.extendedProps.courseId)
    );

    document.getElementById('selection-page').classList.add('hidden');
    document.getElementById('calendar-page').classList.remove('hidden');

    initCalendar(filteredEvents);
}

function goBack() {
    document.getElementById('calendar-page').classList.add('hidden');
    document.getElementById('selection-page').classList.remove('hidden');
}

function initCalendar(events) {
    const calendarEl = document.getElementById('calendar');
    if (calendar) {
        calendar.removeAllEvents();
        calendar.addEventSource(events);
        calendar.render();
        return;
    }
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: events,
        height: 'auto',
        eventColor: '#4f46e5',
        nowIndicator: true,
        slotMinTime: "08:00:00",
        slotMaxTime: "23:00:00"
    });
    calendar.render();
}
