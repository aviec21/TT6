let allEvents = [];
let uniqueCourses = new Set();
let calendar;

// 1. Time Mapping based on your CSV Columns (Adjust if needed)
// Column Index 3 matches 9:00am, Col 4 matches 10:30am, etc.
const timeSlots = {
    3: { start: "09:00", end: "10:15" },
    4: { start: "10:30", end: "11:45" },
    5: { start: "12:00", end: "13:15" },
    // Column 6 is usually Lunch, skip or handle if data exists
    7: { start: "14:30", end: "15:45" },
    8: { start: "16:00", end: "17:15" },
    9: { start: "17:30", end: "18:45" },
    10: { start: "19:00", end: "20:15" },
    11: { start: "20:45", end: "22:00" },
    12: { start: "22:15", end: "23:30" }
};

// 2. Load CSV on Startup
document.addEventListener('DOMContentLoaded', () => {
    Papa.parse("timetable.csv", {
        download: true,
        header: false, // We use index because headers might be complex
        complete: function(results) {
            processData(results.data);
        }
    });
});

function processData(rows) {
    // Start loop from Row 4 (Index 3) where data likely begins
    // Adjust '3' if your header occupies more/less rows
    for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        const dateStr = row[0]; // First column is Date (YYYY-MM-DD)
        const room = row[1];    // Second column is Room

        if (!dateStr || !dateStr.includes("-")) continue; // Skip invalid rows

        // Loop through time columns
        for (const [colIndex, time] of Object.entries(timeSlots)) {
            const cellData = row[colIndex];
            
            if (cellData && cellData.trim() !== "") {
                const rawText = cellData.trim();
                
                // PARSING LOGIC: "BFSI A 1" -> Course: "BFSI A"
                // We split by space and remove the last part if it is a number
                let parts = rawText.split(" ");
                let courseIdentifier = rawText; // Default
                
                // If last part is a number (Session ID), remove it to get Course Name
                if (parts.length > 1 && !isNaN(parts[parts.length - 1])) {
                    parts.pop(); // Remove the '1'
                    courseIdentifier = parts.join(" "); // "BFSI A"
                }

                // Add to unique list for checkboxes
                uniqueCourses.add(courseIdentifier);

                // Add to event list
                allEvents.push({
                    title: rawText + ` (${room})`, // Event Title
                    start: `${dateStr}T${time.start}:00`,
                    end: `${dateStr}T${time.end}:00`,
                    extendedProps: {
                        courseId: courseIdentifier,
                        room: room
                    }
                });
            }
        }
    }

    renderCheckboxes();
}

function renderCheckboxes() {
    const container = document.getElementById('checkbox-container');
    const loading = document.getElementById('loading');
    
    // Sort courses alphabetically
    const sortedCourses = Array.from(uniqueCourses).sort();

    sortedCourses.forEach(course => {
        const div = document.createElement('div');
        div.className = "flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer";
        div.innerHTML = `
            <input type="checkbox" id="${course}" value="${course}" class="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500">
            <label for="${course}" class="ml-3 text-sm font-medium text-gray-900 cursor-pointer w-full select-none">${course}</label>
        `;
        container.appendChild(div);
    });

    loading.style.display = 'none';
    container.classList.remove('hidden');
}

// 3. Page Navigation Logic
function showCalendar() {
    // Get selected courses
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

    if (selectedCourses.length === 0) {
        alert("Please select at least one course.");
        return;
    }

    // Filter events
    const filteredEvents = allEvents.filter(event => 
        selectedCourses.includes(event.extendedProps.courseId)
    );

    // Switch View
    document.getElementById('selection-page').classList.add('hidden');
    document.getElementById('calendar-page').classList.remove('hidden');

    // Initialize Calendar
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
        initialView: 'dayGridMonth', // Or 'timeGridWeek'
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: events,
        height: 'auto',
        eventColor: '#4f46e5', // Indigo color
        nowIndicator: true,
        slotMinTime: "08:00:00",
        slotMaxTime: "23:00:00"
    });

    calendar.render();
}